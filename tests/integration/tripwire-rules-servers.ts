// Per-server and per-capability rules for the tripwire (T2-09), kept apart from tripwire-rules.ts to hold both
// under the file-size guide. tripwire-rules.ts re-exports everything here, so callers import one module. Pure,
// and independent of the gateway code they check.
import type { Precondition, ServerKind } from "./tripwire-rules";
import type { WireRecord } from "./tripwire-wire";

// The owner's chip text for a client-side conversion (decisions-T2-07.md). Written here, not imported from the
// core, so the oracle stays independent of the copy it checks.
export const CLIENT_CONVERSION_CHIP = "Converting on server: this device cannot play the original";
export const CLIENT_CONVERSION_REASON = "DeviceCannotPlay";

// A master playlist must never list a subtitle rendition or an image (trickplay) stream. Returns the offending
// lines; HLS spells tag names and enumerated values in upper case, with attribute order free.
export function findForbiddenRenditions(masterBody: string): string[] {
  const found: string[] = [];
  for (const raw of masterBody.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#EXT-X-IMAGE-STREAM-INF")) found.push(line);
    else if (line.startsWith("#EXT-X-MEDIA:") && /(?:^|[:,])TYPE="?SUBTITLES"?(?:,|$)/.test(line)) found.push(line);
  }
  return found;
}

export interface ClientConversionFacts {
  delivery: string;
  playMethod: string;
  clientReason: string | undefined;
  chip: string | undefined;
  // The row's slice of the wire record.
  requests: readonly WireRecord[];
}

const PLAYBACK_INFO_PATH = /^\/Items\/[^/]+\/PlaybackInfo$/i;

// A conversion the client asked for: an HLS Transcode plan carrying the client's reason and the owner's chip,
// reached by exactly two PlaybackInfo requests whose second turned direct play and stream copy off in the
// body and in the query alike (hard rule: the same flags in both places).
export function checkClientConversion(facts: ClientConversionFacts): string[] {
  const failures: string[] = [];
  if (facts.delivery !== "hls") failures.push(`method: a client-side conversion must be an HLS plan, got ${facts.delivery}`);
  if (facts.playMethod !== "Transcode") failures.push(`method: a client-side conversion must be Transcode, got ${facts.playMethod}`);
  if (facts.clientReason !== CLIENT_CONVERSION_REASON) {
    failures.push(`method: client reason ${facts.clientReason ?? "none"}, expected ${CLIENT_CONVERSION_REASON}`);
  }
  if (facts.chip !== CLIENT_CONVERSION_CHIP) failures.push(`method: the player chip reads "${facts.chip ?? "none"}", expected the owner's text`);
  const infos = facts.requests.filter((request) => request.method === "POST" && PLAYBACK_INFO_PATH.test(request.path));
  if (infos.length !== 2) {
    failures.push(`I1: ${infos.length} PlaybackInfo request(s) for this sample, expected exactly two (the first, then the forced one)`);
    return failures;
  }
  const second = infos[1];
  for (const flag of ["EnableDirectPlay", "AllowVideoStreamCopy"]) {
    const inBody = second.flags?.[flag];
    const inQuery = (second.queryPairs ?? []).filter(([name]) => name.toLowerCase() === flag.toLowerCase()).map(([, value]) => value.trim().toLowerCase());
    if (inBody !== false) failures.push(`I1: the forced PlaybackInfo body has ${flag}=${String(inBody)}, expected false`);
    if (inQuery.length !== 1 || inQuery[0] !== "false") failures.push(`I1: the forced PlaybackInfo query has ${flag}=[${inQuery.join(",")}], expected one false`);
  }
  return failures;
}

export interface PreconditionFacts {
  credentialNames: readonly string[];
  // Item Paths the server listed, library-relative on Jellyscale.
  listedItemPaths: readonly string[];
  samplePath: string;
}

// A not-run row stays honest only while its reason holds. Returns why it no longer does.
export function checkPrecondition(precondition: Precondition, facts: PreconditionFacts): string[] {
  switch (precondition) {
    case "no-restricted-credentials": {
      const found = facts.credentialNames.filter((name) => /^jellyscale_restricted_/.test(name));
      return found.length > 0 ? [`precondition: ${found.join(", ")} now exist; the no-restricted-credentials row must become a run`] : [];
    }
    case "not-listed": {
      const listed = facts.listedItemPaths.find((path) => path.length > 0 && facts.samplePath.endsWith(`/${path}`));
      return listed ? [`precondition: the server now lists an item for this sample (${listed}); the not-listed row must become a run`] : [];
    }
    default:
      return [`precondition: unknown precondition ${String(precondition)}`];
  }
}

export interface JellyfinJobCounts {
  ffmpegProcesses: number;
  sessionsWithJob: number;
  transcodeLogLines: number;
  transcodeLogFiles: number;
}

export interface JellyscaleJobCounts {
  newJobRows: number;
  sessionsWithJob: number;
  transcodeFfmpegProcesses: number;
}

// The names of the job signals that fired, from counts the caller already classified. Each server reads only
// its own oracle: Jellyscale has no Jellyfin log, and its ffmpeg is split into transcodes and other work.
export function jobSignals(kind: "jellyfin", counts: JellyfinJobCounts): string[];
export function jobSignals(kind: "jellyscale", counts: JellyscaleJobCounts): string[];
export function jobSignals(kind: ServerKind, counts: JellyfinJobCounts | JellyscaleJobCounts): string[] {
  const signals: string[] = [];
  if (kind === "jellyfin") {
    const jellyfin = counts as JellyfinJobCounts;
    if (jellyfin.ffmpegProcesses > 0) signals.push("ffmpeg");
    if (jellyfin.sessionsWithJob > 0) signals.push("sessions");
    if (jellyfin.transcodeLogLines > 0 || jellyfin.transcodeLogFiles > 0) signals.push("log");
    return signals;
  }
  const jellyscale = counts as JellyscaleJobCounts;
  if (jellyscale.newJobRows > 0) signals.push("job-rows");
  if (jellyscale.sessionsWithJob > 0) signals.push("sessions");
  if (jellyscale.transcodeFfmpegProcesses > 0) signals.push("ffmpeg");
  return signals;
}
