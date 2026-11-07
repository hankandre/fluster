// Pure pass/fail rules for the server transcode tripwire (tripwire.ts).
// Kept separate so they can be unit tested without a server.

export interface MediaRequestCheck {
  ok: boolean;
  kind: "stream" | "subtitle" | "other";
  reason?: string;
}

const STATIC_STREAM_PATH = /^\/Videos\/[^/]+\/stream$/;
const SUBTITLE_PATH = /^\/Videos\/[^/]+\/[^/]+\/Subtitles\/\d+\/\d+\/Stream\.[A-Za-z0-9]+$/;
const TRANSCODE_MARKERS = [/\.m3u8/i, /\/hls/i, /TranscodingUrl/i, /\/universal/i];

// A player may only request the original file (/Videos/{id}/stream?Static=true)
// or an external subtitle file. The Static check is case-sensitive on purpose:
// the gateway builds exactly "Static=true".
export function checkMediaRequest(rawUrl: string): MediaRequestCheck {
  const url = new URL(rawUrl);
  const full = url.pathname + url.search;
  for (const marker of TRANSCODE_MARKERS) {
    if (marker.test(full)) {
      return { ok: false, kind: "other", reason: `transcode URL marker ${marker} in ${url.pathname}` };
    }
  }
  if (SUBTITLE_PATH.test(url.pathname)) return { ok: true, kind: "subtitle" };
  if (!STATIC_STREAM_PATH.test(url.pathname)) {
    return { ok: false, kind: "other", reason: `not a /Videos/{id}/stream or subtitle path: ${url.pathname}` };
  }
  // Exactly one static key, spelled "Static", with the value "true". Jellyfin
  // binds query names case-insensitively, so static=false next to Static=true
  // would be ambiguous.
  const staticParams = [...url.searchParams].filter(([key]) => /^static$/i.test(key));
  if (staticParams.length !== 1) {
    return { ok: false, kind: "stream", reason: `stream request has ${staticParams.length} static parameters; exactly one Static=true is required` };
  }
  const [[key, value]] = staticParams;
  if (key !== "Static" || value !== "true") {
    return { ok: false, kind: "stream", reason: `stream request has ${key}=${value}; only Static=true is allowed` };
  }
  return { ok: true, kind: "stream" };
}

// ffprobe runs for library scans and media info; it never encodes. Any ffmpeg
// process is treated as an encoding job.
export function classifyProcess(commandLine: string): "ffmpeg" | "ffprobe" | "other" {
  const program = commandLine.trim().split(/\s+/)[0] ?? "";
  const name = program.split("/").pop();
  if (name === "ffprobe") return "ffprobe";
  if (name === "ffmpeg") return "ffmpeg";
  return "other";
}

// TranscodeManager.StartFfMpeg logs the full command line with
// _logger.LogInformation("{Filename} {Arguments}", ...) right before the
// process starts (jellyfin v10.11.7 and v12.4,
// MediaBrowser.MediaEncoding/Transcoding/TranscodeManager.cs). Serilog quotes
// the string arguments, so the path may be wrapped in quotes.
const TRANSCODE_LOG_LINE = /Transcoding\.TranscodeManager: "?[^"\s]*ffmpeg"?\s/;

export function findTranscodeLogLines(logText: string): string[] {
  return logText.split("\n").filter((line) => TRANSCODE_LOG_LINE.test(line));
}

// The same method opens a per-job log file named
// FFmpeg.Transcode-*, FFmpeg.Remux-*, or FFmpeg.DirectStream-* in the log directory.
const TRANSCODE_LOG_FILE = /^FFmpeg\.(Transcode|Remux|DirectStream)-/;

export function findTranscodeLogFiles(fileNames: string[]): string[] {
  return fileNames.filter((name) => TRANSCODE_LOG_FILE.test(name));
}

export interface SessionLike {
  Id?: string | null;
  TranscodingInfo?: unknown;
  PlayState?: { PlayMethod?: string | null } | null;
}

export interface TranscodingSession {
  id: string;
  playMethod?: string;
  transcodingInfo?: unknown;
}

export function findTranscodingSessions(sessions: SessionLike[]): TranscodingSession[] {
  return sessions.flatMap((session) => {
    const playMethod = session.PlayState?.PlayMethod ?? undefined;
    const transcoding = session.TranscodingInfo != null;
    const indirect = playMethod === "Transcode" || playMethod === "DirectStream";
    if (!transcoding && !indirect) return [];
    return [{ id: session.Id ?? "unknown", playMethod, transcodingInfo: session.TranscodingInfo ?? undefined }];
  });
}

// Failure messages start with what they break. I1: server encoding. I2: a
// media request that is not a static original-file request. playback: the
// sample did not play. oracle: a signal could not be read, so the run is blind.
export type FailureKind = "I1" | "I2" | "playback" | "oracle";
export type SampleStatus = "PASS" | "FAIL" | "EXPECTED-REFUSED";

export interface SampleOutcome {
  failures: string[];
  streamRequests: number;
  refusal?: string;
  expectRefused?: string;
}

// Any recorded failure fails the sample. A refusal passes only when the sample
// declares that exact reason and no stream request was made.
export function decideStatus(outcome: SampleOutcome): { status: SampleStatus; extraFailure?: string } {
  const { failures, streamRequests, refusal, expectRefused } = outcome;
  if (expectRefused) {
    if (refusal !== expectRefused) {
      const got = refusal ? `refusal ${refusal}` : "a playback plan";
      return { status: "FAIL", extraFailure: `playback: expected refusal ${expectRefused}, got ${got}` };
    }
    if (streamRequests > 0) {
      return { status: "FAIL", extraFailure: `I2: refused sample still made ${streamRequests} stream request(s)` };
    }
    return { status: failures.length > 0 ? "FAIL" : "EXPECTED-REFUSED" };
  }
  if (refusal) return { status: "FAIL", extraFailure: `playback: unexpected refusal ${refusal}` };
  return { status: failures.length > 0 ? "FAIL" : "PASS" };
}
