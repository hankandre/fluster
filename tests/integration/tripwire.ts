// Server conversion tripwire (decision 0002; ARCHITECTURE.md I1 and the HLS
// URL rules; plan 002 "Tripwire rules after P10-09"; T2-09).
//
// Plays every sample through the real gateway against the three fixture
// servers (Jellyfin 10.11, Jellyfin 12.4, Jellyscale), the way the player
// would, and watches independent signals for a server job: ffmpeg processes
// in the container, TranscodingInfo on /Sessions, the Jellyfin log, and on
// Jellyscale the transcode_jobs table. What each row must do, per server and
// capability set, is written in tripwire-expectations.ts.
// - Playable samples under full capabilities must direct play: no job signal,
//   exactly one PlaybackInfo request, and only /Videos/{id}/stream?Static=true
//   or external subtitle requests, sent with the Authorization header.
// - Conversion samples (the BluRay folder, the H.264 sample under a forced
//   limit, the ISO) must come back with a reason, request only same-origin
//   master.m3u8, main.m3u8, and hls1 URLs with no credential parameter, agree
//   with /Sessions, and leave no job 10 s after the stop.
// - A capability set that lacks a sample's video codec must convert it with
//   the client's reason on Jellyfin, and be refused with device-cannot-play on
//   Jellyscale until T10-08 changes that expectation.
// - The no-conversion user must get conversion-not-allowed for the BluRay
//   folder with no media request and no job (Jellyfin only).
// - Every request of the run goes through one wire recorder, and
//   checkWireRequests holds each server to the header and no-token-in-URL rule.
//
// Prerequisites: pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup
// OCTAVE_CONVERSION_SAMPLES=1 (for generation and for this run) adds the
// dvdsub (playable) and ISO (conversion) samples.
// Usage: pnpm test:tripwire (TRIPWIRE_SERVERS=jellyscale narrows a local run)
// Output: a summary table on stdout and the full JSON log in
// release-evidence/tripwire/<UTC time>.json. Exits 1 on any failure.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { JellyfinGateway } from "../../packages/core/src/jellyfin/gateway";
import { MemoryLanHttpConfirmations } from "../../packages/core/src/lan-http-confirmations";
import { MemoryStreamingLimits, type StreamingLimitStore } from "../../packages/core/src/streaming-limits";
import { checkPrecondition, classifyProcess, findTranscodeLogFiles, findTranscodeLogLines, type ServerKind } from "./tripwire-rules";
import { LogWatcher, ProcessMonitor, countFfmpeg, listProcesses, sleep } from "./tripwire-container";
import { SAMPLES, SERVERS, capabilitiesOf, runPlan, type CapabilitySetName, type SampleDef } from "./tripwire-expectations";
import { JELLYSCALE_PLAY_METHOD_CHECK, findJellyscaleItem, jobRowCounts, listedPaths, prepareJellyscale } from "./tripwire-jellyscale";
import { classifyJellyscaleFfmpeg } from "./tripwire-jellyscale-ffmpeg";
import { emptyResult, playSample, type ServerContext } from "./tripwire-sample";
import { MonitorClient, SessionWatcher, prepareServer, type ItemDto } from "./tripwire-server";
import { newGateway } from "./tripwire-transport";
import { checkWireRequests, installWireRecorder } from "./tripwire-wire";
import { addCredential, errorText, printSummary, scrub, secrets, wireCredentials, type SampleResult, type ServerResult } from "./tripwire-report";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const credentialsFile = join(here, ".credentials");
const evidenceDir = join(repoRoot, "release-evidence", "tripwire");

const LOG_FLUSH_MS = 2000;
const conversionSamplesEnabled = process.env.OCTAVE_CONVERSION_SAMPLES === "1";
const plan = runPlan(conversionSamplesEnabled);
// TRIPWIRE_SERVERS=jellyscale (comma-separated service names) narrows a local run while debugging; CI runs all three.
const onlyServers = process.env.TRIPWIRE_SERVERS?.split(",").map((name) => name.trim()).filter(Boolean);

function readCredentials(): Record<string, string> {
  if (!existsSync(credentialsFile)) {
    console.error("ERROR tests/integration/.credentials is missing. Run pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup first.");
    process.exit(2);
  }
  const values: Record<string, string> = {};
  for (const line of readFileSync(credentialsFile, "utf8").split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) values[line.slice(0, at)] = line.slice(at + 1);
  }
  return values;
}

// After the last sample on a Jellyfin server: one more log read after a flush delay, the log liveness check, and a
// check that something was actually played.
async function finishJellyfin(result: ServerResult, logs: LogWatcher): Promise<void> {
  await sleep(LOG_FLUSH_MS);
  try {
    const { text, newFiles } = await logs.newContent();
    for (const line of findTranscodeLogLines(text)) result.failures.push(`I1: Jellyfin log transcode line after the last sample: ${scrub(line).slice(0, 200)}`);
    for (const name of findTranscodeLogFiles(newFiles)) result.failures.push(`I1: Jellyfin transcode log file after the last sample: ${name}`);
  } catch (error) {
    result.failures.push(`oracle: final Jellyfin log read failed: ${errorText(error)}`);
  }
  if (logs.mainLogFiles.length === 0) result.failures.push("oracle: oracle blind, no log_*.log in /config/log");
  else if (logs.mainLogGrowth === 0) result.failures.push("oracle: oracle blind, the Jellyfin log did not grow during the run");
  result.preparation.mainLogGrowthChars = logs.mainLogGrowth;
}

// A fixed streaming limit for one run, read by the gateway like the user's setting.
function fixedLimit(localMbps: number): StreamingLimitStore {
  const store = new MemoryStreamingLimits();
  store.get = () => ({ localMbps });
  return store;
}

function findItem(kind: ServerKind, items: readonly ItemDto[], sample: SampleDef): ItemDto | undefined {
  return kind === "jellyscale" ? findJellyscaleItem(items, sample.path) : items.find((candidate) => candidate.Path === sample.path);
}

async function runServer(server: (typeof SERVERS)[number], credentials: Record<string, string>, wire: { records: readonly import("./tripwire-wire").WireRecord[] }): Promise<ServerResult> {
  const url = credentials[`${server.name}_url`];
  const login = (prefix: string) => ({ username: credentials[`${server.name}_${prefix}username`], password: credentials[`${server.name}_${prefix}password`] });
  const main = login("");
  const restricted = login("restricted_");
  addCredential(main.password);
  addCredential(restricted.password);
  const result: ServerResult = { server: server.name, url, preparation: {}, samples: [], failures: [] };
  const monitor = new MonitorClient(url, addCredential);
  const gateways = new Map<string, JellyfinGateway>();
  // One signed-in gateway per user, limit and capability set, each its own device and session.
  const gatewayFor = async (sample: SampleDef, set: CapabilitySetName): Promise<JellyfinGateway> => {
    const key = `${sample.user ?? "main"}:${sample.limitMbps ?? "none"}:${set}`;
    const existing = gateways.get(key);
    if (existing) return existing;
    const account = sample.user === "restricted" ? restricted : main;
    if (!account.username || !account.password) throw new Error(`no credentials for ${sample.user ?? "the test user"}; rerun pnpm fixture:setup`);
    const limits = sample.limitMbps === undefined ? new MemoryStreamingLimits() : fixedLimit(sample.limitMbps);
    const capabilities = capabilitiesOf(set);
    const gateway = newGateway(url, randomUUID(), new MemoryLanHttpConfirmations(), limits, {
      version: (JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string }).version,
      deviceName: "Octave Linux",
    }, { get: () => capabilities });
    const connection = await gateway.connect();
    result.version ??= connection.version;
    await gateway.login(account.username, account.password);
    gateways.set(key, gateway);
    return gateway;
  };
  const jobCount = async (): Promise<number> => {
    if (server.kind === "jellyfin") return countFfmpeg(server.name);
    const processes = (await listProcesses(server.name)).filter((process) => classifyProcess(process.command) === "ffmpeg" && classifyJellyscaleFfmpeg(process.command) === "transcode");
    return (await jobRowCounts()).active + processes.length;
  };
  try {
    await monitor.login(main.username, main.password);
    const rows = plan.filter((row) => row.server === server.name);
    const paths = [...new Set(rows.filter((row) => row.expect.kind !== "not-run").map((row) => SAMPLES.find((sample) => sample.name === row.sample)!.path))];
    const prepared = server.kind === "jellyscale" ? await prepareJellyscale(monitor) : await prepareServer(monitor, server.name, paths);
    result.preparation = prepared.preparation;
    await gatewayFor(SAMPLES[0], "full");

    const context: ServerContext = {
      name: server.name,
      kind: server.kind,
      url,
      monitor,
      sessionWatcher: new SessionWatcher(monitor),
      processes: new ProcessMonitor(server.name),
      logs: server.kind === "jellyfin" ? new LogWatcher(server.name) : undefined,
      playMethodCheck: JELLYSCALE_PLAY_METHOD_CHECK,
      get wire() {
        return wire.records;
      },
      gatewayFor,
      jobCount,
    };
    await context.logs?.baseline();
    for (const row of rows) {
      const sample = SAMPLES.find((candidate) => candidate.name === row.sample)!;
      if (row.expect.kind === "not-run") {
        const failures = checkPrecondition(row.expect.precondition, {
          credentialNames: Object.keys(credentials),
          listedItemPaths: listedPaths(prepared.items),
          samplePath: sample.path,
        });
        const notRun: SampleResult = { ...emptyResult(sample, row.set, row.expect), status: failures.length > 0 ? "FAIL" : "NOT-RUN", failures };
        result.samples.push(notRun);
        continue;
      }
      const item = findItem(server.kind, prepared.items, sample);
      if (!item) {
        result.samples.push(emptyResult(sample, row.set, row.expect, "playback: sample not indexed by path"));
        continue;
      }
      result.samples.push(await playSample(context, sample, row.set, row.expect, item));
    }
    if (context.logs) await finishJellyfin(result, context.logs);
    const played = result.samples.filter((sample) => sample.status === "PASS").length;
    if (played === 0) result.failures.push("playback: no sample was played on this server");
  } catch (error) {
    result.error = errorText(error);
  } finally {
    for (const gateway of gateways.values()) await gateway.logout();
    await monitor.logout();
  }
  return result;
}

async function main(): Promise<void> {
  const loginCredentials = readCredentials();
  const startedAt = new Date();
  const results: ServerResult[] = [];
  // One recorder for the whole run, installed before any gateway exists: the gateway's transport, the monitor and
  // the player's fetch all go through it.
  const recorder = installWireRecorder(wireCredentials);
  for (const server of SERVERS.filter((candidate) => !onlyServers || onlyServers.includes(candidate.name))) {
    const recordStart = recorder.records.length;
    const result = await runServer(server, loginCredentials, recorder);
    const origin = new URL(result.url).origin;
    // Everything this server's run sent, to whatever origin: another origin is a failure, not a filter.
    const own = recorder.records.slice(recordStart);
    const wireFailures = checkWireRequests(own, origin);
    result.wire = { requests: own.length, failures: wireFailures.length };
    result.failures.push(...wireFailures.slice(0, 20).map(scrub));
    results.push(result);
  }
  recorder.restore();

  mkdirSync(evidenceDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const logPath = join(evidenceDir, `${stamp}.json`);
  const log = JSON.stringify({ startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), servers: results }, null, 2) + "\n";
  for (const secret of secrets) {
    if (log.includes(secret)) throw new Error("a secret reached the tripwire log; refusing to write it");
  }
  writeFileSync(logPath, log);
  const skipped = conversionSamplesEnabled ? [] : SAMPLES.filter((sample) => sample.optIn).map((sample) => sample.name);
  const failed = printSummary(results, logPath.slice(repoRoot.length + 1), skipped);
  process.exitCode = failed ? 1 : 0;
  if (onlyServers) {
    // A narrowed run never passes: the required tripwire runs every server.
    console.log(`Narrowed run (TRIPWIRE_SERVERS=${onlyServers.join(",")}): not a pass, the full run covers all three servers.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`ERROR tripwire crashed: ${errorText(error)}`);
  process.exitCode = 1;
});
