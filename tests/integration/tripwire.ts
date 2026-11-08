// Server transcode tripwire (invariants I1 and I2 in ARCHITECTURE.md).
//
// Plays every sample through the real JellyfinGateway against both fixture
// servers, the way the player would: PlaybackInfo, start report, ranged reads
// of the stream URL, external subtitle reads, progress and stopped reports.
// While each sample plays it watches three independent signals for a server
// encoding job: ffmpeg processes in the container, TranscodingInfo on
// /Sessions, and the Jellyfin log. Every media request must be a
// /Videos/{id}/stream?Static=true URL or an external subtitle file.
//
// Prerequisites: pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup
// Usage: pnpm test:tripwire
// Output: a summary table on stdout and the full JSON log in
// release-evidence/tripwire/<UTC time>.json. Exits 1 on any failure.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LibraryItem } from "../../src/domain/catalog";
import { PlaybackRefusedError, type PlaybackPlan, type PlaybackSnapshot, type RefusalReason } from "../../src/domain/playback";
import { JellyfinGateway } from "../../src/lib/jellyfin/gateway";
import { redactText } from "../../src/lib/redact";
import {
  checkMediaRequest,
  decideStatus,
  findTranscodeLogFiles,
  findTranscodeLogLines,
  type FailureKind,
  type SampleStatus,
} from "./tripwire-rules";
import { LogWatcher, ProcessMonitor, sleep } from "./tripwire-container";
import { MonitorClient, SessionWatcher, prepareServer, type ItemDto } from "./tripwire-server";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const credentialsFile = join(here, ".credentials");
const evidenceDir = join(repoRoot, "release-evidence", "tripwire");

const SERVERS = [
  { name: "jellyfin-10-11", label: "10.11" },
  { name: "jellyfin-12", label: "12.4" },
];

// Items are found by path, because metadata matching renames some titles.
// expectRefused: the gateway must refuse the item with exactly this reason and
// make no stream request. Any other refusal fails the sample.
// expectExternalSubtitle: the plan must carry an external subtitle URL, and
// fetching it must pass the I2 rule.
// "converted" is a bridge until P10-09 checks conversions: the gateway
// returned an HLS plan, which this tripwire neither plays nor requests.
type ExpectedOutcome = RefusalReason | "converted";

interface Sample {
  name: string;
  path: string;
  expectRefused?: ExpectedOutcome;
  expectExternalSubtitle?: boolean;
}

const SAMPLES: Sample[] = [
  { name: "h264", path: "/media/movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv" },
  { name: "hevc-hdr10", path: "/media/movies/Synthetic HEVC HDR10 (2024)/Synthetic HEVC HDR10 (2024).mkv" },
  { name: "av1", path: "/media/movies/Synthetic AV1 (2024)/Synthetic AV1 (2024).mkv" },
  { name: "ass", path: "/media/movies/Synthetic ASS (2024)/Synthetic ASS (2024).mkv" },
  { name: "sidecar-srt", path: "/media/movies/Synthetic Sidecar (2024)/Synthetic Sidecar (2024).mkv", expectExternalSubtitle: true },
  { name: "multitrack", path: "/media/movies/Synthetic Multitrack (2024)/Synthetic Multitrack (2024).mkv" },
  { name: "versions", path: "/media/movies/Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv" },
  // Jellyfin ignores Static=true for BluRay/DVD and starts ffmpeg instead
  // (VideosController.GetVideoStream), so the gateway never direct plays disc
  // folders; since P10-03 it returns an HLS conversion plan for them.
  { name: "bluray-folder", path: "/media/movies/Synthetic BluRay (2024)", expectRefused: "converted" },
  { name: "show-s01e01", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E01.mkv" },
  { name: "show-s01e02", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E02.mkv" },
  { name: "show-s00e01", path: "/media/shows/Synthetic Show/Season 00/Synthetic Show S00E01.mkv" },
];

const MIB = 1024 * 1024;
const PLAYBACK_HOLD_MS = 1500;
const AFTER_STOP_GRACE_MS = 1500;
const LOG_FLUSH_MS = 2000;

type Status = SampleStatus;

interface MediaRequestLog {
  url: string;
  range?: string;
  status?: number;
  contentType?: string;
  contentRange?: string;
  bytes?: number;
  check: string;
}

interface SampleResult {
  sample: string;
  path: string;
  status: Status;
  expectRefused?: string;
  refusal?: string;
  failures: string[];
  notes: string[];
  videoType?: string;
  plan?: { mediaSourceId: string; streamUrl: string; tracks: number; externalSubtitles: number };
  mediaRequests: MediaRequestLog[];
  sessions: { polls: number; sawOurSession: number; ourPlayMethods: string[]; transcoding: unknown[] };
  processPolls: number;
  ffmpegProcesses: string[];
  ffprobeProcesses: string[];
  transcodeLogLines: string[];
  transcodeLogFiles: string[];
  durationMs: number;
}

interface ServerResult {
  server: string;
  url: string;
  version?: string;
  preparation: Record<string, unknown>;
  samples: SampleResult[];
  // Failures that belong to the whole server run, such as a blind log.
  failures: string[];
  error?: string;
}

// Every value that must never reach stdout or the log file.
const secrets = new Set<string>();

function addSecret(value: string | undefined): void {
  if (value && value.length >= 6) secrets.add(value);
}

function scrub(text: string): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join("[redacted]");
  return redactText(result);
}

// Keeps the parameters the evidence needs (Static, MediaSourceId) and hides
// every other value, including api_key and PlaySessionId.
function safeUrl(raw: string): string {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (!/^static$/i.test(key) && key !== "MediaSourceId") url.searchParams.set(key, "[redacted]");
  }
  return url.pathname + url.search.replace(/%5B/g, "[").replace(/%5D/g, "]");
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return scrub(message);
}

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

function snapshot(positionSeconds: number, paused = false): PlaybackSnapshot {
  return {
    positionSeconds,
    paused,
    buffering: false,
    volume: 100,
    muted: false,
    tracks: [],
    diagnostics: { decodeMode: "unknown", decodeLabel: "tripwire", droppedFrames: 0 },
  };
}

// The instrumented player fetch: checks and records every media request.
async function mediaFetch(result: SampleResult, rawUrl: string, range?: string): Promise<Response | undefined> {
  const check = checkMediaRequest(rawUrl);
  const entry: MediaRequestLog = { url: safeUrl(rawUrl), range, check: check.ok ? `ok (${check.kind})` : `FAIL: ${check.reason}` };
  result.mediaRequests.push(entry);
  if (!check.ok) {
    fail(result, "I2", `media request ${entry.url}: ${check.reason}`);
    return undefined;
  }
  // A player follows redirects, so a redirect could lead to a transcode URL.
  // Media requests must be answered directly.
  const response = await fetch(rawUrl, { headers: range ? { Range: range } : {}, redirect: "manual" });
  const body = new Uint8Array(await response.arrayBuffer());
  entry.status = response.status;
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const target = location ? safeUrl(new URL(location, rawUrl).toString()) : "no Location header";
    fail(result, "I2", `media request ${entry.url} was redirected (${response.status}) to ${target}`);
    return undefined;
  }
  entry.contentType = response.headers.get("content-type") ?? undefined;
  entry.contentRange = response.headers.get("content-range") ?? undefined;
  entry.bytes = body.byteLength;
  const expected = range ? 206 : 200;
  if (response.status !== expected) {
    fail(result, "playback", `media request ${entry.url} (${range ?? "no range"}) returned ${response.status}, expected ${expected}`);
  }
  if (/mpegurl/i.test(entry.contentType ?? "")) {
    fail(result, "I2", `media request ${entry.url} returned an HLS playlist (${entry.contentType})`);
  }
  return response;
}

async function playSample(
  gateway: JellyfinGateway,
  sessionWatcher: SessionWatcher,
  processes: ProcessMonitor,
  logs: LogWatcher,
  sample: Sample,
  item: ItemDto,
): Promise<SampleResult> {
  const startedAt = Date.now();
  const result: SampleResult = {
    sample: sample.name,
    path: sample.path,
    status: "PASS",
    failures: [],
    notes: [],
    videoType: item.VideoType,
    mediaRequests: [],
    sessions: { polls: 0, sawOurSession: 0, ourPlayMethods: [], transcoding: [] },
    processPolls: 0,
    ffmpegProcesses: [],
    ffprobeProcesses: [],
    transcodeLogLines: [],
    transcodeLogFiles: [],
    durationMs: 0,
    expectRefused: sample.expectRefused,
  };
  processes.start();
  sessionWatcher.start(item.Id);
  let plan: PlaybackPlan | undefined;
  try {
    try {
      plan = await gateway.createPlaybackPlan(toLibraryItem(item));
    } catch (error) {
      if (!(error instanceof PlaybackRefusedError)) throw error;
      result.refusal = error.reason;
      result.notes.push(`gateway refused (${error.reason}): ${errorText(error)}`);
    }
    if (plan && plan.delivery !== "static") {
      result.refusal = "converted";
      result.notes.push(`gateway returned a ${plan.playMethod} plan; not played until P10-09`);
      plan = undefined;
    }
    if (plan) {
      const streamParams = new URL(plan.streamUrl).searchParams;
      addSecret(plan.playSessionId);
      addSecret(streamParams.get("api_key") ?? undefined);
      const externalSubtitles = plan.tracks.filter((track) => track.type === "Subtitle" && track.external && track.deliveryUrl);
      result.plan = { mediaSourceId: plan.mediaSourceId, streamUrl: safeUrl(plan.streamUrl), tracks: plan.tracks.length, externalSubtitles: externalSubtitles.length };

      await gateway.reportStart(plan, snapshot(0));
      const first = await mediaFetch(result, plan.streamUrl, `bytes=0-${MIB - 1}`);
      const total = Number(first?.headers.get("content-range")?.split("/")[1]);
      if (Number.isFinite(total) && total > 2 * MIB) {
        const middle = Math.floor(total / 2);
        await mediaFetch(result, plan.streamUrl, `bytes=${middle}-${middle + MIB - 1}`);
      }
      await mediaFetch(result, plan.streamUrl, "bytes=-65536");
      for (const track of externalSubtitles) await mediaFetch(result, track.deliveryUrl!);
      if (sample.expectExternalSubtitle) {
        const fetched = result.mediaRequests.some((request) => request.check === "ok (subtitle)" && request.status === 200);
        if (externalSubtitles.length === 0) fail(result, "playback", "expected an external subtitle DeliveryUrl in the plan, found none");
        else if (!fetched) fail(result, "playback", "the external subtitle request did not pass the I2 rule with HTTP 200");
      }
      await gateway.reportProgress(plan, snapshot(5));
      await sleep(PLAYBACK_HOLD_MS);
      await gateway.reportProgress(plan, snapshot(6, true));
      await gateway.reportStopped(plan, snapshot(10));
    }
  } catch (error) {
    fail(result, "playback", `playback error: ${errorText(error)}`);
  }

  await sleep(AFTER_STOP_GRACE_MS);
  await processes.stop();
  await sessionWatcher.stop(item.Id);
  result.sessions = {
    polls: sessionWatcher.polls,
    sawOurSession: sessionWatcher.sawOurSession,
    ourPlayMethods: [...sessionWatcher.playMethods],
    transcoding: [...sessionWatcher.transcoding],
  };
  result.processPolls = processes.polls;
  for (const error of [...processes.errors, ...sessionWatcher.errors]) fail(result, "oracle", scrub(error));
  if (processes.polls === 0) fail(result, "oracle", "no process listing succeeded during playback");
  if (plan && sessionWatcher.sawOurSession === 0) fail(result, "oracle", "the session watcher never saw this playback on /Sessions");
  for (const session of sessionWatcher.transcoding) {
    const what = session.transcodingInfo !== undefined ? "TranscodingInfo" : `PlayMethod ${session.playMethod}`;
    fail(result, "I1", `/Sessions: session ${session.id} had ${what}`);
  }
  for (const method of sessionWatcher.playMethods) {
    if (method !== "DirectPlay") fail(result, "I1", `/Sessions: this playback reported PlayMethod ${method}`);
  }
  result.ffmpegProcesses = [...processes.ffmpeg.values()].map(scrub);
  result.ffprobeProcesses = [...processes.ffprobe.values()].map(scrub);
  for (const command of result.ffmpegProcesses) fail(result, "I1", `ffmpeg process in container: ${command.slice(0, 160)}`);

  try {
    const { text, newFiles } = await logs.newContent();
    result.transcodeLogLines = findTranscodeLogLines(text).map(scrub);
    result.transcodeLogFiles = findTranscodeLogFiles(newFiles);
  } catch (error) {
    fail(result, "oracle", `reading the Jellyfin log failed: ${errorText(error)}`);
  }
  for (const line of result.transcodeLogLines) fail(result, "I1", `Jellyfin log transcode line: ${line.slice(0, 200)}`);
  for (const name of result.transcodeLogFiles) fail(result, "I1", `Jellyfin transcode log file: ${name}`);

  const decision = decideStatus({
    failures: result.failures,
    streamRequests: result.mediaRequests.length,
    refusal: result.refusal,
    expectRefused: sample.expectRefused,
  });
  if (decision.extraFailure) result.failures.push(decision.extraFailure);
  result.status = decision.status;
  result.durationMs = Date.now() - startedAt;
  return result;
}

function fail(result: SampleResult, kind: FailureKind, message: string): void {
  result.failures.push(`${kind}: ${message}`);
}

function emptyResult(sample: Sample, failure: string): SampleResult {
  return {
    sample: sample.name,
    path: sample.path,
    status: "FAIL",
    failures: [failure],
    notes: [],
    mediaRequests: [],
    sessions: { polls: 0, sawOurSession: 0, ourPlayMethods: [], transcoding: [] },
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

async function runServer(server: (typeof SERVERS)[number], credentials: Record<string, string>): Promise<ServerResult> {
  const url = credentials[`${server.name}_url`];
  const username = credentials[`${server.name}_username`];
  const password = credentials[`${server.name}_password`];
  addSecret(password);
  const result: ServerResult = { server: server.name, url, preparation: {}, samples: [], failures: [] };
  const monitor = new MonitorClient(url, addSecret);
  const gateway = new JellyfinGateway(url, undefined, randomUUID());
  try {
    await monitor.login(username, password);
    const prepared = await prepareServer(monitor, server.name, SAMPLES.map((sample) => sample.path));
    result.preparation = prepared.preparation;
    result.version = (await gateway.connect()).version;
    await gateway.login(username, password);

    const processes = new ProcessMonitor(server.name);
    const sessionWatcher = new SessionWatcher(monitor);
    const logs = new LogWatcher(server.name);
    await logs.baseline();
    for (const sample of SAMPLES) {
      const item = prepared.items.find((candidate) => candidate.Path === sample.path);
      if (!item) {
        result.samples.push(emptyResult(sample, "playback: sample not indexed by path"));
        continue;
      }
      result.samples.push(await playSample(gateway, sessionWatcher, processes, logs, sample, item));
    }
    await finishServer(result, logs);
  } catch (error) {
    result.error = errorText(error);
  } finally {
    await gateway.logout();
    await monitor.logout();
  }
  return result;
}

function sampleDetail(sample: SampleResult): string {
  switch (sample.status) {
    case "FAIL":
      return sample.failures[0] ?? "failed";
    case "EXPECTED-REFUSED":
      return `gateway refused (${sample.refusal}, VideoType ${sample.videoType ?? "?"}); no stream request, no encode`;
    case "PASS":
      return `PlayMethod ${sample.sessions.ourPlayMethods.join("/") || "?"}, no ffmpeg, no TranscodingInfo, no transcode log`;
  }
}

function printSummary(results: ServerResult[], logPath: string): boolean {
  let failed = false;
  const rows: string[][] = [["SERVER", "SAMPLE", "RESULT", "REQUESTS", "DETAIL"]];
  for (const server of results) {
    if (server.error) {
      failed = true;
      rows.push([server.server, "-", "FAIL", "-", `setup: ${server.error}`]);
    }
    if (server.failures.length > 0) failed = true;
    for (const sample of server.samples) {
      if (sample.status === "FAIL") failed = true;
      const staticRequests = sample.mediaRequests.filter((request) => request.check.startsWith("ok")).length;
      rows.push([`${server.server} ${server.version ?? ""}`.trim(), sample.sample, sample.status, `${staticRequests}/${sample.mediaRequests.length}`, sampleDetail(sample)]);
    }
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => (column === 4 ? 0 : row[column].length))));
  for (const row of rows) console.log(row.map((cell, column) => (column === 4 ? cell : cell.padEnd(widths[column]))).join("  "));
  for (const server of results) {
    if (server.error) console.log(`ERROR ${server.server}: ${server.error}`);
    for (const failure of server.failures) console.log(`ERROR ${server.server}: ${failure}`);
    for (const sample of server.samples) {
      for (const failure of sample.failures) console.log(`ERROR ${server.server} ${sample.sample}: ${failure}`);
    }
  }
  console.log(`\nFull log: ${logPath}`);
  console.log(failed ? "Tripwire FAILED." : "Tripwire passed: no server encoding and only Static=true media requests.");
  return failed;
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
  const failed = printSummary(results, logPath.slice(repoRoot.length + 1));
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(`ERROR tripwire crashed: ${errorText(error)}`);
  process.exitCode = 1;
});
