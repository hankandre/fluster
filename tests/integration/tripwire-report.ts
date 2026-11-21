// Result types, redaction, and the summary table for the tripwire (tripwire.ts).
import type { ServerPlayMethod } from "../../packages/core/src/domain/playback";
import { redactText } from "../../packages/core/src/redact";
import type { AfterStopObservation, Expectation, FailureKind, SampleStatus } from "./tripwire-rules";

export interface MediaRequestLog {
  url: string;
  range?: string;
  status?: number;
  contentType?: string;
  contentRange?: string;
  bytes?: number;
  check: string;
}

export interface ConversionResult {
  // The label PlaybackInfo's URL gave, before the server check.
  negotiatedMethod: string;
  // The label the app shows and reports after the server check.
  playMethod: string;
  serverConfirmed: boolean;
  server?: ServerPlayMethod;
  conversionReasons: string[];
  indicator?: string;
  stoppedReport: string;
  afterStop: AfterStopObservation[];
  jobGoneAfterMs?: number;
}

export interface SampleResult {
  sample: string;
  // The capability set the gateway ran with: "full", or the lacking set's name.
  capabilities: string;
  path: string;
  status: SampleStatus;
  expect: Expectation;
  user: string;
  streamingLimit: string;
  refusal?: string;
  failures: string[];
  notes: string[];
  videoType?: string;
  plan?: { delivery: string; playMethod: string; mediaSourceId: string; streamUrl: string; tracks: number; externalSubtitles: number };
  conversion?: ConversionResult;
  mediaRequests: MediaRequestLog[];
  // PlaybackInfo requests counted in the row's slice of the wire record.
  playbackInfoRequests: number;
  // Jellyscale only: rows added to transcode_jobs during the row's window, and the job signals that fired.
  newJobRows?: number;
  jobSignals: string[];
  sessions: { polls: number; sawOurSession: number; ourPlayMethods: string[]; transcoding: unknown[]; transcodingInfo: unknown[] };
  processPolls: number;
  ffmpegProcesses: string[];
  ffprobeProcesses: string[];
  transcodeLogLines: string[];
  transcodeLogFiles: string[];
  durationMs: number;
}

export interface ServerResult {
  server: string;
  url: string;
  version?: string;
  preparation: Record<string, unknown>;
  samples: SampleResult[];
  // Failures that belong to the whole server run, such as a blind log.
  failures: string[];
  // Requests the wire recorder saw for this server, and how many broke the wire rule.
  wire?: { requests: number; failures: number };
  error?: string;
}

// Every value that must never reach stdout or the log file.
export const secrets = new Set<string>();

export function addSecret(value: string | undefined): void {
  if (value && value.length >= 6) secrets.add(value);
}

// The subset of secrets that must never appear in a URL: tokens and passwords. A play-session id is a secret for
// the log, but the stream URL carries it as PlaySessionId by design, so it stays out of this set.
export const wireCredentials = new Set<string>();

export function addCredential(value: string | undefined): void {
  addSecret(value);
  if (value && value.length >= 6) wireCredentials.add(value);
}

export function scrub(text: string): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join("[redacted]");
  return redactText(result);
}

// Keeps the parameters the evidence needs (Static, MediaSourceId,
// EnableTrickplay) and hides every other value, including api_key and
// PlaySessionId.
export function safeUrl(raw: string): string {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (!/^(static|enabletrickplay)$/i.test(key) && key !== "MediaSourceId") url.searchParams.set(key, "[redacted]");
  }
  return url.pathname + url.search.replace(/%5B/g, "[").replace(/%5D/g, "]");
}

export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return scrub(message);
}

export function fail(result: SampleResult, kind: FailureKind, message: string): void {
  result.failures.push(`${kind}: ${message}`);
}

function sampleDetail(sample: SampleResult): string {
  switch (sample.status) {
    case "FAIL":
      return sample.failures[0] ?? "failed";
    case "NOT-RUN":
      return `not run: ${sample.expect.kind === "not-run" ? sample.expect.reason : "no reason"} (precondition ${sample.expect.kind === "not-run" ? sample.expect.precondition : "?"} holds)`;
    case "EXPECTED-REFUSED":
      return `gateway refused (${sample.refusal}, VideoType ${sample.videoType ?? "?"}); no media request, no job`;
    case "PASS":
      return `PlayMethod ${sample.sessions.ourPlayMethods.join("/") || "?"}, no server job signal`;
    case "CONVERTED": {
      const conversion = sample.conversion!;
      const reasons = conversion.conversionReasons.join(",") || "none";
      const gone = conversion.jobGoneAfterMs === undefined ? "?" : `${(conversion.jobGoneAfterMs / 1000).toFixed(1)} s`;
      return `${conversion.negotiatedMethod} -> ${conversion.playMethod} (reasons ${reasons}), /Sessions ${sample.sessions.ourPlayMethods.join("/")}, job gone ${gone} after stop`;
    }
  }
}

export function printSummary(results: ServerResult[], logPath: string, skippedOptIn: string[]): boolean {
  let failed = false;
  const rows: string[][] = [["SERVER", "CAPABILITIES", "SAMPLE", "RESULT", "REQUESTS", "DETAIL"]];
  for (const server of results) {
    if (server.error) {
      failed = true;
      rows.push([server.server, "-", "-", "FAIL", "-", `setup: ${server.error}`]);
    }
    if (server.failures.length > 0) failed = true;
    for (const sample of server.samples) {
      if (sample.status === "FAIL") failed = true;
      const staticRequests = sample.mediaRequests.filter((request) => request.check.startsWith("ok")).length;
      rows.push([`${server.server} ${server.version ?? ""}`.trim(), sample.capabilities, sample.sample, sample.status, `${staticRequests}/${sample.mediaRequests.length}`, sampleDetail(sample)]);
    }
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => (column === 5 ? 0 : row[column].length))));
  for (const row of rows) console.log(row.map((cell, column) => (column === 5 ? cell : cell.padEnd(widths[column]))).join("  "));
  for (const server of results) {
    if (server.error) console.log(`ERROR ${server.server}: ${server.error}`);
    for (const failure of server.failures) console.log(`ERROR ${server.server}: ${failure}`);
    for (const sample of server.samples) {
      for (const failure of sample.failures) console.log(`ERROR ${server.server} ${sample.sample}: ${failure}`);
    }
  }
  console.log("");
  for (const server of results) {
    if (server.wire) console.log(`Wire ${server.server}: ${server.wire.requests} request(s) recorded, ${server.wire.failures} broke the header, token-in-URL, redirect or origin rule`);
  }
  console.log(`Full log: ${logPath}`);
  if (skippedOptIn.length > 0) {
    console.log(`Skipped opt-in samples (generate and run with OCTAVE_CONVERSION_SAMPLES=1): ${skippedOptIn.join(", ")}`);
  }
  console.log(failed
    ? "Tripwire FAILED."
    : "Tripwire passed: playable samples direct played with no server job; conversions followed the HLS rules, matched /Sessions, and left no job; every request carried the header and no credential parameter.");
  return failed;
}
