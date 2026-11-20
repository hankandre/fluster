import "./polyfills";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as ExpoCrypto from "expo-crypto";
import { fetch } from "expo/fetch";
import { JellyfinGateway } from "../../../src/lib/jellyfin/gateway";
import { MemoryLanHttpConfirmations } from "../../../src/lib/lan-http-confirmations";
import { OctavePlayer, OctavePlayerView, type PlayerStatusEvent } from "../modules/octave-player";
import { asOctave, ExpoFetchTransport } from "./expo-fetch-transport";

// Logcat lines start with OCTAVE_JS. They never contain a URL, header, token or session id.
function log(message: string): void {
  console.log(`OCTAVE_JS ${message}`);
}

interface Ready {
  url: string;
  title: string;
}

async function jsProbes(origin: string, authorization: string): Promise<Record<string, number>> {
  const status = async (path: string) => {
    try {
      return (await fetch(`${origin}${path}`, { redirect: "manual", headers: { Authorization: authorization } })).status;
    } catch {
      return -1;
    }
  };
  return {
    redirectSameStatus: await status("/__octave_probe/redirect-same"),
    redirectCanaryStatus: await status("/__octave_probe/redirect-canary"),
  };
}

async function prepare(setStatus: (text: string) => void): Promise<Ready | undefined> {
  const config = OctavePlayer.takeLaunchConfig();
  if (!config.server || !config.user || config.pass === undefined || !config.title) {
    setStatus("Waiting for launch extras (octave.server, octave.user, octave.pass, octave.title).");
    log("no launch config");
    return undefined;
  }
  const started = Date.now();
  const transport = new ExpoFetchTransport(config.server.replace(/\/$/, ""));
  const gateway = new JellyfinGateway(
    config.server,
    transport,
    ExpoCrypto.randomUUID(),
    new MemoryLanHttpConfirmations(),
    undefined,
    { version: "0.0.1-spike", deviceName: "Octave Play Falsifier" },
  );
  transport.useSessionHeader(() => gateway.authorizationHeader());

  setStatus("Connecting");
  const connection = await gateway.connect();
  log(`connected version=${connection.version} hostClass=${connection.hostClass} confirm=${connection.needsUnencryptedConfirmation}`);
  // The operator's consent to plain HTTP is the run-time choice of server (spike only).
  if (connection.needsUnencryptedConfirmation) gateway.confirmUnencryptedConnection();
  await gateway.login(config.user, config.pass);
  log(`signed in after ${Date.now() - started}ms`);

  setStatus(`Looking up ${config.title}`);
  const page = await gateway.searchItems(config.title.split(":")[0].trim(), { startIndex: 0, limit: 25 });
  // Titles are compared on letters and digits only ("Spider-Man: Into the Spider-Verse").
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = norm(config.title);
  const matches = page.cards.filter((c) => norm(c.title) === wanted);
  const card = matches.find((c) => c.kind === "Movie" && (!config.year || c.subtitle === config.year))
    ?? matches.find((c) => !config.year || c.subtitle === config.year);
  if (!card) {
    setStatus(`Not found: ${config.title} ${config.year ?? ""}`);
    log(`lookup failed results=${page.cards.length} titleMatches=${matches.length} years=[${matches.map((c) => c.subtitle ?? "-").join(",")}]`);
    return undefined;
  }
  log(`lookup ok kind=${card.kind} year=${card.subtitle}`);

  const plan = await gateway.createPlaybackPlan({
    id: card.id, name: card.title, type: "Movie", resumePositionTicks: 0, played: false,
  });
  log(`plan delivery=${plan.delivery} playMethod=${plan.playMethod} reasons=[${plan.conversionReasons.join(",")}] tracks=${plan.tracks.length}`);
  if (plan.delivery !== "static") {
    setStatus(`Not direct play: ${plan.playMethod} ${plan.conversionReasons.join(", ")}`);
    return undefined;
  }

  const origin = new URL(config.server).origin;
  if (config.canary) {
    log(`js probes ${JSON.stringify(await jsProbes(origin, asOctave(gateway.authorizationHeader())))}`);
  }
  // The one hand-over of the header (and token) to native code.
  OctavePlayer.startSession(`${origin}/`, asOctave(gateway.authorizationHeader()));
  if (config.canary) {
    log(`native probes ${JSON.stringify(await OctavePlayer.runNativeProbes(origin, config.canary))}`);
  }
  log(`control requests=${transport.requests} ready after ${Date.now() - started}ms`);
  return { url: plan.streamUrl, title: card.title };
}

export default function App() {
  const [status, setStatus] = useState("Starting");
  const [ready, setReady] = useState<Ready>();
  const [player, setPlayer] = useState("");

  useEffect(() => {
    prepare(setStatus).then((result) => {
      if (result) {
        setReady(result);
        setStatus(result.title);
      }
    }).catch((error: unknown) => {
      const name = error instanceof Error ? error.constructor.name : "unknown";
      const kind = (error as { kind?: string }).kind ?? "";
      const message = error instanceof Error ? error.message : "";
      // Redacted: no URL, no Token="...", no long hex (tokens, ids).
      const safe = message.replace(/https?:\/\/\S*/g, "<url>").replace(/Token="[^"]*"/g, "Token=<r>").replace(/[0-9a-f]{16,}/gi, "<hex>").slice(0, 300);
      log(`prepare failed ${name} ${kind} ${safe}`);
      setStatus(`Failed: ${name} ${kind}`);
    });
  }, []);

  const onStatus = ({ nativeEvent }: { nativeEvent: PlayerStatusEvent }) => {
    const { event, tMs, ...rest } = nativeEvent;
    if (event === "stats") return;
    setPlayer(`${event} ${JSON.stringify(rest)} at ${tMs} ms`);
  };

  return (
    <View style={styles.root}>
      {ready ? <OctavePlayerView style={StyleSheet.absoluteFill} url={ready.url} onStatus={onStatus} /> : null}
      <View style={styles.hud} pointerEvents="none">
        <Text style={styles.text}>{status}</Text>
        {player ? <Text style={styles.text}>{player}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  hud: { position: "absolute", left: 48, bottom: 32, right: 48 },
  text: { color: "#bbb", fontSize: 18 },
});
