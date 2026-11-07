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
import type { PlaybackPlan, PlaybackSnapshot } from "../../src/domain/playback";
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
// A knownGap sample may fail playback (an unexpected HTTP status) without
// failing the run, but an encoding signal or a non-static request still fails
// it. Once the gap is fixed the sample fails until its knownGap is removed.
const SAMPLES: { name: string; path: string; knownGap?: string }[] = [
  { name: "h264", path: "/media/movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv" },
  { name: "hevc-hdr10", path: "/media/movies/Synthetic HEVC HDR10 (2024)/Synthetic HEVC HDR10 (2024).mkv" },
  { name: "av1", path: "/media/movies/Synthetic AV1 (2024)/Synthetic AV1 (2024).mkv" },
  { name: "ass", path: "/media/movies/Synthetic ASS (2024)/Synthetic ASS (2024).mkv" },
  { name: "sidecar-srt", path: "/media/movies/Synthetic Sidecar (2024)/Synthetic Sidecar (2024).mkv" },
  { name: "multitrack", path: "/media/movies/Synthetic Multitrack (2024)/Synthetic Multitrack (2024).mkv" },
  { name: "versions", path: "/media/movies/Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv" },
  {
    name: "bluray-folder",
    path: "/media/movies/Synthetic BluRay (2024)",
    knownGap: "P1-03: without a DeviceProfile the server offers SupportsDirectPlay for BluRay folders, the gateway accepts it, and Static=true is not honored for BluRay/DVD (VideosController.GetVideoStream falls through to ffmpeg; the placeholder BDMV fails earlier with HTTP 500)",
  },
  { name: "show-s01e01", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E01.mkv" },
  { name: "show-s01e02", path: "/media/shows/Synthetic Show/Season 01/Synthetic Show S01E02.mkv" },
  { name: "show-s00e01", path: "/media/shows/Synthetic Show/Season 00/Synthetic Show S00E01.mkv" },
];

// The gateway's own refusal when no static, file-backed source exists.
const REFUSAL_MESSAGE = "No static, file-backed direct-play source is available";

const MIB = 1024 * 1024;
const PLAYBACK_HOLD_MS = 1500;
const AFTER_STOP_GRACE_MS = 1500;

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
  knownGap?: string;
  failures: string[];
  notes: string[];
  videoType?: string;
  plan?: { mediaSourceId: string; streamUrl: string; tracks: number; externalSubtitles: number };
  mediaRequests: MediaRequestLog[];
  sessions: { polls: number; ourPlayMethods: string[]; transcoding: unknown[] };
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
    if (key !== "Static" && key !== "MediaSourceId") url.searchParams.set(key, "[redacted]");
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
  const response = await fetch(rawUrl, { headers: range ? { Range: range } : {} });
  const body = new Uint8Array(await response.arrayBuffer());
  entry.status = response.status;
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
  sample: (typeof SAMPLES)[number],
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
    sessions: { polls: 0, ourPlayMethods: [], transcoding: [] },
    ffmpegProcesses: [],
    ffprobeProcesses: [],
    transcodeLogLines: [],
    transcodeLogFiles: [],
    durationMs: 0,
  };
  processes.start();
  sessionWatcher.start(item.Id);
  let refused = false;
  try {
    let plan: PlaybackPlan | undefined;
    try {
      plan = await gateway.createPlaybackPlan(toLibraryItem(item));
    } catch (error) {
      const message = errorText(error);
      if (!message.includes(REFUSAL_MESSAGE)) throw error;
      refused = true;
      result.notes.push(`gateway refused: ${message}`);
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
  result.sessions = { polls: sessionWatcher.polls, ourPlayMethods: [...sessionWatcher.playMethods], transcoding: [...sessionWatcher.transcoding] };
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

  const { text, newFiles } = await logs.newContent();
  result.transcodeLogLines = findTranscodeLogLines(text).map(scrub);
  result.transcodeLogFiles = findTranscodeLogFiles(newFiles);
  for (const line of result.transcodeLogLines) fail(result, "I1", `Jellyfin log transcode line: ${line.slice(0, 200)}`);
  for (const name of result.transcodeLogFiles) fail(result, "I1", `Jellyfin transcode log file: ${name}`);

  processes.ffmpeg.clear();
  processes.ffprobe.clear();
  const decision = decideStatus(result.failures, refused, sample.knownGap);
  if (decision.extraFailure) result.failures.push(decision.extraFailure);
  if (sample.knownGap) result.knownGap = sample.knownGap;
  result.status = decision.status;
  result.durationMs = Date.now() - startedAt;
  return result;
}

function fail(result: SampleResult, kind: FailureKind, message: string): void {
  result.failures.push(`${kind}: ${message}`);
}

async function runServer(server: (typeof SERVERS)[number], credentials: Record<string, string>): Promise<ServerResult> {
  const url = credentials[`${server.name}_url`];
  const username = credentials[`${server.name}_username`];
  const password = credentials[`${server.name}_password`];
  addSecret(password);
  const result: ServerResult = { server: server.name, url, preparation: {}, samples: [] };
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
        result.samples.push({
          sample: sample.name, path: sample.path, status: "FAIL", failures: ["playback: sample not indexed by path"], notes: [],
          mediaRequests: [], sessions: { polls: 0, ourPlayMethods: [], transcoding: [] }, ffmpegProcesses: [], ffprobeProcesses: [], transcodeLogLines: [], transcodeLogFiles: [], durationMs: 0,
        });
        continue;
      }
      result.samples.push(await playSample(gateway, sessionWatcher, processes, logs, sample, item));
    }
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
    case "KNOWN-GAP":
      return `no encode observed; ${sample.failures[0]}`;
    case "REFUSED":
      return `gateway refused (VideoType ${sample.videoType ?? "?"}); no encode observed`;
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
    for (const sample of server.samples) {
      const label = sample.status === "FAIL" ? "ERROR" : "KNOWN-GAP";
      if (sample.status === "KNOWN-GAP") console.log(`KNOWN-GAP ${server.server} ${sample.sample}: ${sample.knownGap}`);
      for (const failure of sample.failures) console.log(`${label} ${server.server} ${sample.sample}: ${failure}`);
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
