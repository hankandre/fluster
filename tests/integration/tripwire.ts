// Server conversion tripwire (decision 0002; ARCHITECTURE.md I1 and the HLS
// URL rules; plan 002 "Tripwire rules after P10-09").
//
// Plays every sample through the real JellyfinGateway against both fixture
// servers, the way the player would, and watches three independent signals
// for a server job: ffmpeg processes in the container, TranscodingInfo on
// /Sessions, and the Jellyfin log.
// - Playable samples (no streaming limit) must direct play: no job signal,
//   and only /Videos/{id}/stream?Static=true or external subtitle requests.
// - Conversion samples (the BluRay folder, the H.264 sample under a forced
//   limit, the ISO) must come back DirectStream or Transcode with a reason,
//   request only same-origin master.m3u8, main.m3u8, and hls1 URLs with no
//   credential parameter and EnableTrickplay=false, agree with /Sessions
//   PlayMethod and TranscodingInfo, and leave no job 10 s after the stop.
// - The no-conversion user must get conversion-not-allowed for the BluRay
//   folder with no media request and no job.
//
// Prerequisites: pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup
// FLUSTER_CONVERSION_SAMPLES=1 (for generation and for this run) adds the
// dvdsub (playable) and ISO (conversion) samples.
// Usage: pnpm test:tripwire
// Output: a summary table on stdout and the full JSON log in
// release-evidence/tripwire/<UTC time>.json. Exits 1 on any failure.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LibraryItem } from "../../src/domain/catalog";
import { PlaybackRefusedError, type PlaybackPlan } from "../../src/domain/playback";
import { conversionIndicator } from "../../src/features/player/conversion-copy";
import { JellyfinGateway } from "../../src/lib/jellyfin/gateway";
import { MemoryLanHttpConfirmations } from "../../src/lib/lan-http-confirmations";
import { MemoryStreamingLimits, type StreamingLimitStore } from "../../src/lib/streaming-limits";
import {
  checkConversionPlan,
  checkJobGone,
  checkSessionAgreement,
  decideStatus,
  findTranscodeLogFiles,
  findTranscodeLogLines,
  type Expectation,
} from "./tripwire-rules";
import { LogWatcher, ProcessMonitor, sleep } from "./tripwire-container";
import { JOB_GONE_DEADLINE_MS, playConversion } from "./tripwire-hls";
import { MonitorClient, SessionWatcher, prepareServer, type ItemDto } from "./tripwire-server";
import { playStatic } from "./tripwire-static";
import {
  addSecret,
  errorText,
  fail,
  printSummary,
  safeUrl,
  scrub,
  secrets,
  type SampleResult,
  type ServerResult,
} from "./tripwire-report";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const credentialsFile = join(here, ".credentials");
const evidenceDir = join(repoRoot, "release-evidence", "tripwire");

const SERVERS = [
  { name: "jellyfin-10-11", label: "10.11" },
  { name: "jellyfin-12", label: "12.4" },
];

// Items are found by path, because metadata matching renames some titles.
// user: "restricted" plays as fluster-noconv (setup-servers.sh), whose policy
// forbids video and audio transcoding and remuxing.
// limitMbps: the local streaming limit the gateway reads for this run; absent
// is "No limit". optIn: generated only with FLUSTER_CONVERSION_SAMPLES=1.
interface Sample {
  name: string;
  path: string;
  expect: Expectation;
  user?: "restricted";
  limitMbps?: number;
  optIn?: boolean;
}

const BLURAY = "/media/movies/Synthetic BluRay (2024)";
const H264 = "/media/movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv";
const DIRECT: Expectation = { kind: "direct-play" };
const BOTH_METHODS = ["DirectStream", "Transcode"] as const;

const SAMPLES: Sample[] = [
  { name: "h264", path: H264, expect: DIRECT },
  { name: "hevc-hdr10", path: "/media/movies/Synthetic HEVC HDR10 (2024)/Synthetic HEVC HDR10 (2024).mkv", expect: DIRECT },
  { name: "av1", path: "/media/movies/Synthetic AV1 (2024)/Synthetic AV1 (2024).mkv", expect: DIRECT },
  { name: "ass", path: "/media/movies/Synthetic ASS (2024)/Synthetic ASS (2024).mkv", expect: DIRECT },
  { name: "sidecar-srt", path: "/media/movies/Synthetic Sidecar (2024)/Synthetic Sidecar (2024).mkv", expect: { kind: "direct-play", externalSubtitle: true } },
  { name: "multitrack", path: "/media/movies/Synthetic Multitrack (2024)/Synthetic Multitrack (2024).mkv", expect: DIRECT },
  { name: "versions", path: "/media/movies/Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv", expect: DIRECT },
  { name: "dvdsub", path: "/media/movies/Synthetic DVDSub (2024)/Synthetic DVDSub (2024).mkv", expect: DIRECT, optIn: true },
  { name: "show-s01e01", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E01.mkv", expect: DIRECT },
  { name: "show-s01e02", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E02.mkv", expect: DIRECT },
  { name: "show-s00e01", path: "/media/shows/Synthetic Show/Season 00/Synthetic Show S00E01.mkv", expect: DIRECT },
  // Jellyfin never direct plays disc folders (StreamBuilder) and ignores
  // Static=true for them (VideosController.GetVideoStream). The server sends
  // no TranscodeReasons for this folder on 10.11.7, so the reason checked is
  // the indicator's, which falls back to "the server needs to convert this file".
  { name: "bluray-folder", path: BLURAY, expect: { kind: "conversion", methods: BOTH_METHODS } },
  // 0.2 Mbit/s is below the sample's ~0.5 Mbit/s and below Fluster's lowest
  // offered limit (2 Mbit/s), so this run injects its own limit store; the
  // gateway still reads it the way it reads the user's setting.
  {
    name: "h264-limited",
    path: H264,
    limitMbps: 0.2,
    expect: { kind: "conversion", methods: ["Transcode"], reasonsAnyOf: ["ContainerBitrateExceedsLimit", "VideoBitrateNotSupported"] },
  },
  { name: "iso", path: "/media/movies/Synthetic ISO (2024)/Synthetic ISO (2024).iso", expect: { kind: "conversion", methods: BOTH_METHODS }, optIn: true },
  { name: "bluray-noconv", path: BLURAY, user: "restricted", expect: { kind: "refused", reason: "conversion-not-allowed" } },
];

const AFTER_STOP_GRACE_MS = 1500;
const LOG_FLUSH_MS = 2000;
const conversionSamplesEnabled = process.env.FLUSTER_CONVERSION_SAMPLES === "1";
const activeSamples = SAMPLES.filter((sample) => conversionSamplesEnabled || !sample.optIn);

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

function toLibraryItem(item: ItemDto): LibraryItem {
  return {
    id: item.Id,
    name: item.Name ?? "unknown",
    type: item.Type === "Episode" ? "Episode" : "Movie",
    seriesName: item.SeriesName,
    resumePositionTicks: 0,
    played: false,
  };
}

interface ServerContext {
  name: string;
  url: string;
  monitor: MonitorClient;
  sessionWatcher: SessionWatcher;
  processes: ProcessMonitor;
  logs: LogWatcher;
  gatewayFor(sample: Sample): Promise<JellyfinGateway>;
}

async function playSample(server: ServerContext, sample: Sample, item: ItemDto): Promise<SampleResult> {
  const startedAt = Date.now();
  const result: SampleResult = {
    ...emptyResult(sample),
    status: "PASS",
    videoType: item.VideoType,
  };
  const { sessionWatcher, processes, logs } = server;
  processes.start();
  sessionWatcher.start(item.Id);
  let plan: PlaybackPlan | undefined;
  let hasAudio = false;
  let confirmedAt = 0;
  let confirmedMethod: string | undefined;
  try {
    const gateway = await server.gatewayFor(sample);
    try {
      plan = await gateway.createPlaybackPlan(toLibraryItem(item));
    } catch (error) {
      if (!(error instanceof PlaybackRefusedError)) throw error;
      result.refusal = error.reason;
      result.notes.push(`gateway refused (${error.reason}): ${errorText(error)}`);
    }
    if (plan) {
      addSecret(plan.playSessionId);
      addSecret(/Token="([^"]+)"/.exec(gateway.authorizationHeader())?.[1]);
      addSecret(new URL(plan.streamUrl).searchParams.get("api_key") ?? undefined);
      hasAudio = plan.tracks.some((track) => track.type === "Audio");
      result.plan = {
        delivery: plan.delivery,
        playMethod: plan.playMethod,
        mediaSourceId: plan.mediaSourceId,
        streamUrl: safeUrl(plan.streamUrl),
        tracks: plan.tracks.length,
        externalSubtitles: 0,
      };
      if (plan.delivery === "static" && sample.expect.kind === "direct-play") {
        await playStatic(gateway, result, plan, sample.expect.externalSubtitle === true);
      } else if (plan.delivery === "hls" && sample.expect.kind === "conversion") {
        result.conversion = {
          negotiatedMethod: plan.playMethod,
          playMethod: plan.playMethod,
          serverConfirmed: false,
          conversionReasons: [...plan.conversionReasons],
          stoppedReport: "not sent",
          afterStop: [],
        };
        const outcome = await playConversion({
          plan,
          gateway,
          serverUrl: server.url,
          monitor: server.monitor,
          service: server.name,
          record: (request) => result.mediaRequests.push(request),
          safeUrl,
          fail: (kind, message) => fail(result, kind, scrub(message)),
        });
        // What the viewer sees and the reports say: the plan after the
        // server confirmed copy or encode.
        const shown = outcome.confirmed;
        const indicator = conversionIndicator(shown);
        result.conversion.playMethod = shown.playMethod;
        result.conversion.serverConfirmed = outcome.server !== undefined;
        result.conversion.server = outcome.server;
        result.conversion.conversionReasons = [...shown.conversionReasons];
        result.conversion.indicator = indicator?.chip;
        confirmedAt = outcome.confirmedAt;
        confirmedMethod = shown.playMethod;
        if (!outcome.server) fail(result, "oracle", "the server never answered the play-method check within 10 s");
        for (const failure of checkConversionPlan(
          { playMethod: shown.playMethod, conversionReasons: shown.conversionReasons, indicatorReasons: indicator?.reasons ?? [] },
          sample.expect,
        )) result.failures.push(failure);
        result.conversion.stoppedReport = outcome.stoppedReport;
        result.conversion.afterStop = outcome.afterStop;
        const gone = checkJobGone(outcome.afterStop, JOB_GONE_DEADLINE_MS);
        result.conversion.jobGoneAfterMs = gone.goneAfterMs;
        result.failures.push(...gone.failures);
      } else {
        result.notes.push(`gateway returned a ${plan.delivery} plan (${plan.playMethod}); not played, because the sample expects ${sample.expect.kind}`);
      }
    }
  } catch (error) {
    fail(result, "playback", `playback error: ${errorText(error)}`);
  }

  if (sample.expect.kind !== "conversion") await sleep(AFTER_STOP_GRACE_MS);
  await processes.stop();
  await sessionWatcher.stop(item.Id);
  result.sessions = {
    polls: sessionWatcher.polls,
    sawOurSession: sessionWatcher.sawOurSession,
    ourPlayMethods: [...sessionWatcher.playMethods],
    transcoding: [...sessionWatcher.transcoding],
    transcodingInfo: [...sessionWatcher.transcodingInfo.values()],
  };
  result.processPolls = processes.polls;
  for (const error of [...processes.errors, ...sessionWatcher.errors]) fail(result, "oracle", scrub(error));
  if (processes.polls === 0) fail(result, "oracle", "no process listing succeeded during playback");
  if (plan && result.mediaRequests.length > 0 && sessionWatcher.sawOurSession === 0) {
    fail(result, "oracle", "the session watcher never saw this playback on /Sessions");
  }
  result.ffmpegProcesses = [...processes.ffmpeg.values()].map(scrub);
  result.ffprobeProcesses = [...processes.ffprobe.values()].map(scrub);
  try {
    const { text, newFiles } = await logs.newContent();
    result.transcodeLogLines = findTranscodeLogLines(text).map(scrub);
    result.transcodeLogFiles = findTranscodeLogFiles(newFiles);
  } catch (error) {
    fail(result, "oracle", `reading the Jellyfin log failed: ${errorText(error)}`);
  }

  if (sample.expect.kind === "conversion") {
    // A conversion is expected to start a job; /Sessions must agree with the
    // confirmed method from the first report that carried it, and the job
    // must be gone after the stop (checked above).
    if (confirmedMethod && result.mediaRequests.length > 0) {
      result.failures.push(...checkSessionAgreement(confirmedMethod, sessionWatcher.observations, hasAudio, confirmedAt));
    }
  } else {
    // Direct play and refusals: no job signal at all.
    for (const session of sessionWatcher.transcoding) {
      const what = session.transcodingInfo !== undefined ? "TranscodingInfo" : `PlayMethod ${session.playMethod}`;
      fail(result, "I1", `/Sessions: session ${session.id} had ${what}`);
    }
    for (const method of sessionWatcher.playMethods) {
      if (method !== "DirectPlay") fail(result, "I1", `/Sessions: this playback reported PlayMethod ${method}`);
    }
    for (const command of result.ffmpegProcesses) fail(result, "I1", `ffmpeg process in container: ${command.slice(0, 160)}`);
    for (const line of result.transcodeLogLines) fail(result, "I1", `Jellyfin log transcode line: ${line.slice(0, 200)}`);
    for (const name of result.transcodeLogFiles) fail(result, "I1", `Jellyfin transcode log file: ${name}`);
  }

  const decision = decideStatus({
    expect: sample.expect,
    failures: result.failures,
    mediaRequests: result.mediaRequests.length,
    delivery: plan?.delivery,
    refusal: result.refusal,
  });
  if (decision.extraFailure) result.failures.push(decision.extraFailure);
  result.status = decision.status;
  result.durationMs = Date.now() - startedAt;
  return result;
}

function emptyResult(sample: Sample, failure?: string): SampleResult {
  return {
    sample: sample.name,
    path: sample.path,
    status: "FAIL",
    expect: sample.expect,
    user: sample.user ?? "fluster-test",
    streamingLimit: sample.limitMbps === undefined ? "no limit" : `${sample.limitMbps} Mbit/s (local)`,
    failures: failure ? [failure] : [],
    notes: [],
    mediaRequests: [],
    sessions: { polls: 0, sawOurSession: 0, ourPlayMethods: [], transcoding: [], transcodingInfo: [] },
    processPolls: 0,
    ffmpegProcesses: [],
    ffprobeProcesses: [],
    transcodeLogLines: [],
    transcodeLogFiles: [],
    durationMs: 0,
  };
}

// After the last sample: one more log read after a flush delay, the log
// liveness check, and a check that something was actually played.
async function finishServer(result: ServerResult, logs: LogWatcher): Promise<void> {
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
  const played = result.samples.filter((sample) => sample.status === "PASS").length;
  if (played === 0) result.failures.push("playback: no sample was played on this server");
}

// A fixed streaming limit for one run, read by the gateway like the user's setting.
function fixedLimit(localMbps: number): StreamingLimitStore {
  const store = new MemoryStreamingLimits();
  store.get = () => ({ localMbps });
  return store;
}

async function runServer(server: (typeof SERVERS)[number], credentials: Record<string, string>): Promise<ServerResult> {
  const url = credentials[`${server.name}_url`];
  const login = (prefix: string) => ({ username: credentials[`${server.name}_${prefix}username`], password: credentials[`${server.name}_${prefix}password`] });
  const main = login("");
  const restricted = login("restricted_");
  addSecret(main.password);
  addSecret(restricted.password);
  const result: ServerResult = { server: server.name, url, preparation: {}, samples: [], failures: [] };
  const monitor = new MonitorClient(url, addSecret);
  const gateways = new Map<string, JellyfinGateway>();
  // One signed-in gateway per user and limit, each its own device and session.
  const gatewayFor = async (sample: Sample): Promise<JellyfinGateway> => {
    const key = `${sample.user ?? "main"}:${sample.limitMbps ?? "none"}`;
    const existing = gateways.get(key);
    if (existing) return existing;
    const account = sample.user === "restricted" ? restricted : main;
    if (!account.username || !account.password) throw new Error(`no credentials for ${sample.user ?? "the test user"}; rerun pnpm fixture:setup`);
    const limits = sample.limitMbps === undefined ? new MemoryStreamingLimits() : fixedLimit(sample.limitMbps);
    const gateway = new JellyfinGateway(url, undefined, randomUUID(), new MemoryLanHttpConfirmations(), limits);
    const connection = await gateway.connect();
    result.version ??= connection.version;
    await gateway.login(account.username, account.password);
    gateways.set(key, gateway);
    return gateway;
  };
  try {
    await monitor.login(main.username, main.password);
    const prepared = await prepareServer(monitor, server.name, [...new Set(activeSamples.map((sample) => sample.path))]);
    result.preparation = prepared.preparation;
    await gatewayFor({ name: "h264", path: H264, expect: DIRECT });

    const context: ServerContext = {
      name: server.name,
      url,
      monitor,
      sessionWatcher: new SessionWatcher(monitor),
      processes: new ProcessMonitor(server.name),
      logs: new LogWatcher(server.name),
      gatewayFor,
    };
    await context.logs.baseline();
    for (const sample of activeSamples) {
      const item = prepared.items.find((candidate) => candidate.Path === sample.path);
      if (!item) {
        result.samples.push(emptyResult(sample, "playback: sample not indexed by path"));
        continue;
      }
      result.samples.push(await playSample(context, sample, item));
    }
    await finishServer(result, context.logs);
  } catch (error) {
    result.error = errorText(error);
  } finally {
    for (const gateway of gateways.values()) await gateway.logout();
    await monitor.logout();
  }
  return result;
}

async function main(): Promise<void> {
  const credentials = readCredentials();
  const startedAt = new Date();
  const results: ServerResult[] = [];
  for (const server of SERVERS) results.push(await runServer(server, credentials));

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
}

main().catch((error) => {
  console.error(`ERROR tripwire crashed: ${errorText(error)}`);
  process.exitCode = 1;
});
