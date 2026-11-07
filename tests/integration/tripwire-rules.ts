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
  if (url.searchParams.get("Static") !== "true") {
    return { ok: false, kind: "stream", reason: "stream request lacks Static=true" };
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

// Failure messages start with the invariant they break. I1: server encoding.
// I2: a media request that is not a static original-file request. playback:
// anything else that stops the sample from playing.
export type FailureKind = "I1" | "I2" | "playback";
export type SampleStatus = "PASS" | "FAIL" | "REFUSED" | "KNOWN-GAP";

export const GAP_RESOLVED = "playback: known gap no longer reproduces; remove its knownGap entry in tests/integration/tripwire.ts";

// I1 and I2 failures always fail. A sample with a known gap may fail playback
// only; once it stops failing, it fails until the knownGap entry is removed.
export function decideStatus(
  failures: string[],
  refused: boolean,
  knownGap?: string,
): { status: SampleStatus; extraFailure?: string } {
  const violations = failures.filter((failure) => !failure.startsWith("playback:"));
  if (violations.length > 0) return { status: "FAIL" };
  if (knownGap) {
    if (failures.length > 0) return { status: "KNOWN-GAP" };
    return { status: "FAIL", extraFailure: GAP_RESOLVED };
  }
  if (failures.length > 0) return { status: "FAIL" };
  return { status: refused ? "REFUSED" : "PASS" };
}
