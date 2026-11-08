// Pure pass/fail rules for the server conversion tripwire (tripwire.ts).
// Kept separate so they can be unit tested without a server. The rules are
// the oracle, so they do not import the gateway code they check.

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

// Failure messages start with what they break. I1: a server job for a file
// that must direct play, or a job left after a conversion stopped. I2: a
// media request outside the rules for its delivery. method: the plan, the
// server's /Sessions answer, or the conversion reason disagree with what the
// sample expects. playback: the sample did not play. oracle: a signal could
// not be read, so the run is blind.
export type FailureKind = "I1" | "I2" | "method" | "playback" | "oracle";
export type SampleStatus = "PASS" | "FAIL" | "EXPECTED-REFUSED" | "CONVERTED";

// What a sample must do. direct-play: the original file with no server job.
// conversion: an HLS plan with one of the allowed methods, played under the
// HLS request rules. refused: this exact refusal before any media request.
export type Expectation =
  | { kind: "direct-play"; externalSubtitle?: boolean }
  | { kind: "conversion"; methods: readonly PlanMethod[]; reasonsAnyOf?: readonly string[] }
  | { kind: "refused"; reason: string };

export type PlanMethod = "DirectStream" | "Transcode";

export interface SampleOutcome {
  expect: Expectation;
  failures: string[];
  mediaRequests: number;
  // The plan's delivery when the gateway returned one.
  delivery?: "static" | "hls";
  refusal?: string;
}

// Any recorded failure fails the sample. A playable sample must come back as
// a static plan, a conversion sample as an HLS plan, and a refused sample
// with exactly its reason and no media request.
export function decideStatus(outcome: SampleOutcome): { status: SampleStatus; extraFailure?: string } {
  const { expect, failures, mediaRequests, delivery, refusal } = outcome;
  const got = refusal ? `refusal ${refusal}` : delivery ? `a ${delivery} plan` : "no plan";
  const status = (pass: SampleStatus) => ({ status: failures.length > 0 ? "FAIL" as const : pass });
  switch (expect.kind) {
    case "refused":
      if (refusal !== expect.reason) {
        return { status: "FAIL", extraFailure: `playback: expected refusal ${expect.reason}, got ${got}` };
      }
      if (mediaRequests > 0) {
        return { status: "FAIL", extraFailure: `I2: refused sample still made ${mediaRequests} media request(s)` };
      }
      return status("EXPECTED-REFUSED");
    case "direct-play":
      if (refusal) return { status: "FAIL", extraFailure: `playback: unexpected refusal ${refusal}` };
      if (delivery !== "static") return { status: "FAIL", extraFailure: `I1: a playable sample must direct play, got ${got}` };
      return status("PASS");
    case "conversion":
      if (refusal) return { status: "FAIL", extraFailure: `playback: unexpected refusal ${refusal}` };
      if (delivery !== "hls") return { status: "FAIL", extraFailure: `method: expected a conversion, got ${got}` };
      return status("CONVERTED");
  }
}

// ---- Conversions (decision 0002, plan 002 "Tripwire rules after P10-09") ----

// Query names a server or proxy may read as a token, compared trimmed and in
// lower case. Kept here, not imported from the gateway, so the oracle is
// independent of the code it checks.
const CREDENTIAL_NAMES = new Set(["apikey", "api_key", "access_token", "token", "x-emby-token", "apitoken", "accesstoken"]);

export function isCredentialName(name: string): boolean {
  return CREDENTIAL_NAMES.has(name.trim().toLowerCase());
}

export type HlsRequestKind = "master" | "variant" | "segment";

export interface HlsRequestCheck {
  ok: boolean;
  kind?: HlsRequestKind;
  reason?: string;
}

// {base}/videos|audio/{id}/master.m3u8, main.m3u8, or hls1/{playlist}/{segment}.{ext};
// the fixed segments in any case, as ASP.NET routes them.
const HLS_PATH = /^\/(?:videos|audio)\/[^/]+\/(?:(master\.m3u8)|(main\.m3u8)|hls1\/[^/]+\/-?\d+\.(?:ts|mp4|m4s|aac))$/i;

// A conversion may only request same-origin master.m3u8, main.m3u8, or hls1
// segments, with no credential parameter and EnableTrickplay=false on every
// request (the server copies the master's query onto the variant and segment
// URLs, DynamicHlsHelper and DynamicHlsPlaylistGenerator in 10.11.7 and 12.4).
export function checkHlsRequest(rawUrl: string, serverUrl: string): HlsRequestCheck {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "not a URL" };
  }
  const server = new URL(serverUrl);
  if (url.origin !== server.origin) return { ok: false, reason: `cross-origin request to ${url.origin}` };
  if (url.username || url.password) return { ok: false, reason: "user info in the URL" };
  const base = server.pathname.replace(/\/$/, "");
  if (!url.pathname.toLowerCase().startsWith(base.toLowerCase() + "/")) return { ok: false, reason: `outside the server base path: ${url.pathname}` };
  const match = HLS_PATH.exec(url.pathname.slice(base.length));
  if (!match) return { ok: false, reason: `not a master.m3u8, main.m3u8, or hls1 path: ${url.pathname}` };
  const kind: HlsRequestKind = match[1] ? "master" : match[2] ? "variant" : "segment";
  const names = [...url.searchParams.keys()];
  const credential = names.find(isCredentialName);
  if (credential !== undefined) return { ok: false, kind, reason: `credential parameter ${credential.trim()}` };
  const trickplay = [...url.searchParams].filter(([key]) => key.trim().toLowerCase() === "enabletrickplay");
  if (trickplay.length === 0) return { ok: false, kind, reason: "no EnableTrickplay=false parameter" };
  const bad = trickplay.find(([, value]) => value.trim().toLowerCase() !== "false");
  if (bad) return { ok: false, kind, reason: `EnableTrickplay=${bad[1]}` };
  if (names.some((key) => /^static$/i.test(key.trim()))) return { ok: false, kind, reason: "a Static parameter on a conversion request" };
  return { ok: true, kind };
}

// URIs a client must follow in an HLS playlist: plain URI lines and every
// URI="..." attribute (EXT-X-MAP, EXT-X-MEDIA, EXT-X-KEY, and the rest).
export function playlistUris(body: string): string[] {
  const uris: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.startsWith("#")) {
      uris.push(line);
      continue;
    }
    for (const match of line.matchAll(/URI="([^"]*)"/g)) uris.push(match[1]);
  }
  return uris;
}

// A playlist body must name no credential parameter anywhere, even in a tag
// a player ignores (decision 0002, E1-B defence in depth).
export function findCredentialInBody(body: string): string | undefined {
  for (const match of body.matchAll(/[?&]([^=&?\s"#]+)=/g)) {
    if (isCredentialName(decodeURIComponentSafe(match[1]))) return match[1];
  }
  return undefined;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface ConversionPlanFacts {
  playMethod: string;
  conversionReasons: readonly string[];
  // The indicator's reason text: the server's reason, or the fallback copy
  // when the server sent none (a disc folder on 10.11.7).
  indicatorReasons: readonly string[];
}

// The plan must use an allowed method and carry a reason: a server reason
// from reasonsAnyOf when the sample names some, otherwise any indicator
// reason, which falls back to "the server needs to convert this file".
export function checkConversionPlan(plan: ConversionPlanFacts, expect: Extract<Expectation, { kind: "conversion" }>): string[] {
  const failures: string[] = [];
  if (!(expect.methods as readonly string[]).includes(plan.playMethod)) {
    failures.push(`method: plan method ${plan.playMethod}, expected ${expect.methods.join(" or ")}`);
  }
  if (expect.reasonsAnyOf && !plan.conversionReasons.some((reason) => expect.reasonsAnyOf!.includes(reason))) {
    failures.push(`method: plan reasons [${plan.conversionReasons.join(", ")}] include none of ${expect.reasonsAnyOf.join(", ")}`);
  }
  if (plan.indicatorReasons.length === 0 || plan.indicatorReasons.some((reason) => !reason.trim())) {
    failures.push("method: the conversion indicator has no reason");
  }
  return failures;
}

// One /Sessions poll of the converting session while its job ran.
export interface SessionObservation {
  // When the poll answered (Date.now()).
  at?: number;
  playMethod?: string;
  transcoding?: { isVideoDirect?: boolean; isAudioDirect?: boolean };
}

// /Sessions must agree with the app's confirmed method (the label the viewer
// sees) and with the app's reports (decision 0002 rule 5 as amended
// 2026-11-08, second amendment). TranscodingInfo, seen at any time while the
// job ran, says DirectStream exactly when video and, for a source with audio,
// audio are copied (IsVideoDirect, IsAudioDirect); that must equal the
// confirmed method. Every report for a converted session carries PlayMethod
// Transcode, so PlayState.PlayMethod in every poll at or after `since` (the
// first report after confirmation) must be Transcode and at least one such
// poll must still show TranscodingInfo: a DirectStream or DirectPlay report
// makes the server drop it (SessionManager.OnPlaybackStart and
// OnPlaybackProgress call ClearTranscodingInfo, v10.11.7 lines 759-762 and
// 888-891, v12.4 lines 778-781 and 920-923).
export function checkSessionAgreement(method: string, observations: readonly SessionObservation[], hasAudio: boolean, since = 0): string[] {
  const withJob = observations.filter((observation) => observation.transcoding);
  if (withJob.length === 0) return ["oracle: /Sessions never showed TranscodingInfo for this conversion"];
  const failures: string[] = [];
  const copies = new Set(withJob.map(({ transcoding }) => {
    const video = transcoding!.isVideoDirect === true;
    const audio = !hasAudio || transcoding!.isAudioDirect === true;
    return video && audio ? "DirectStream" : "Transcode";
  }));
  for (const serverMethod of copies) {
    if (serverMethod !== method) {
      const detail = withJob.map(({ transcoding }) => `IsVideoDirect=${transcoding!.isVideoDirect} IsAudioDirect=${transcoding!.isAudioDirect}`)[0];
      failures.push(`method: /Sessions TranscodingInfo (${detail}) means ${serverMethod}, plan ${method}`);
    }
  }
  const reported = observations.filter((observation) => (observation.at ?? 0) >= since);
  if (reported.length === 0) failures.push("oracle: /Sessions never showed this playback after the confirmed method was reported");
  for (const playMethod of new Set(reported.map((observation) => observation.playMethod ?? "none"))) {
    if (playMethod !== "Transcode") failures.push(`method: /Sessions PlayMethod ${playMethod}, reports must stay Transcode`);
  }
  if (reported.length > 0 && !reported.some((observation) => observation.transcoding)) {
    failures.push("method: /Sessions lost TranscodingInfo after the confirmed method was reported");
  }
  return failures;
}

// One look at the server after the stopped report.
export interface AfterStopObservation {
  msAfterStop: number;
  ffmpegProcesses: number;
  sessionsWithTranscodingInfo: number;
}

// No job may remain the given time after the stopped report: the last
// observation at or past the deadline must show no ffmpeg process and no
// session with TranscodingInfo. Returns the failures and, when the job went
// away, how long it took.
export function checkJobGone(observations: readonly AfterStopObservation[], deadlineMs: number): { failures: string[]; goneAfterMs?: number } {
  const atDeadline = observations.filter((observation) => observation.msAfterStop >= deadlineMs);
  if (atDeadline.length === 0) return { failures: [`oracle: no server observation ${deadlineMs / 1000} s after the stopped report`] };
  const failures: string[] = [];
  const last = atDeadline[atDeadline.length - 1];
  if (last.ffmpegProcesses > 0) failures.push(`I1: ${last.ffmpegProcesses} ffmpeg process(es) ${Math.round(last.msAfterStop / 1000)} s after the stopped report`);
  if (last.sessionsWithTranscodingInfo > 0) failures.push(`I1: TranscodingInfo still on /Sessions ${Math.round(last.msAfterStop / 1000)} s after the stopped report`);
  const clean = (observation: AfterStopObservation) => observation.ffmpegProcesses === 0 && observation.sessionsWithTranscodingInfo === 0;
  let goneAfterMs: number | undefined;
  for (let index = observations.length - 1; index >= 0 && clean(observations[index]); index -= 1) goneAfterMs = observations[index].msAfterStop;
  return { failures, goneAfterMs };
}
