// Result types, redaction, and the summary table for the tripwire (tripwire.ts).
import { redactText } from "../../src/lib/redact";
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
  playMethod: string;
  conversionReasons: string[];
  indicator?: string;
  stoppedReport: string;
  afterStop: AfterStopObservation[];
  jobGoneAfterMs?: number;
}

export interface SampleResult {
  sample: string;
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
  error?: string;
}

// Every value that must never reach stdout or the log file.
export const secrets = new Set<string>();

export function addSecret(value: string | undefined): void {
  if (value && value.length >= 6) secrets.add(value);
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
    case "EXPECTED-REFUSED":
      return `gateway refused (${sample.refusal}, VideoType ${sample.videoType ?? "?"}); no media request, no job`;
    case "PASS":
      return `PlayMethod ${sample.sessions.ourPlayMethods.join("/") || "?"}, no ffmpeg, no TranscodingInfo, no transcode log`;
    case "CONVERTED": {
      const conversion = sample.conversion!;
      const reasons = conversion.conversionReasons.join(",") || "none";
      const gone = conversion.jobGoneAfterMs === undefined ? "?" : `${(conversion.jobGoneAfterMs / 1000).toFixed(1)} s`;
      return `${conversion.playMethod} (reasons ${reasons}), /Sessions ${sample.sessions.ourPlayMethods.join("/")}, job gone ${gone} after stop`;
    }
  }
}

export function printSummary(results: ServerResult[], logPath: string, skippedOptIn: string[]): boolean {
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
  if (skippedOptIn.length > 0) {
    console.log(`Skipped opt-in samples (generate and run with FLUSTER_CONVERSION_SAMPLES=1): ${skippedOptIn.join(", ")}`);
  }
  console.log(failed
    ? "Tripwire FAILED."
    : "Tripwire passed: playable samples direct played with no server job; conversions followed the HLS rules, matched /Sessions, and left no job.");
  return failed;
}
