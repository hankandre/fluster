import type { LaunchRequest, MediaTrack, PlaybackPlan } from "../domain/playback";
import { ticksToSeconds } from "../domain/playback";
import { isCredentialQueryName } from "../jellyfin/credential-query";

// The plan carried a URL Octave will not hand to the player. The message is fixed and names no part of the URL.
export class LaunchRefusedError extends Error {
  constructor() {
    super("Octave will not send this stream address to the player.");
    this.name = "LaunchRefusedError";
  }
}

// Builds the engine's launch request from a negotiated plan (T2-05). It copies field by field, so nothing else on
// the plan (item, title, play session, conversion) reaches the engine, and it re-checks every URL it copies:
// http or https, no user info, no credential query, one origin. It never builds a URL.
export function launchRequest(plan: PlaybackPlan, sessionId: string): LaunchRequest {
  const tracks = plan.tracks.map(copyTrack);
  const common = {
    sessionId,
    startPositionSeconds: ticksToSeconds(plan.startPositionTicks),
    tracks,
    ...(plan.defaultAudioStreamIndex !== undefined ? { audioStreamIndex: plan.defaultAudioStreamIndex } : {}),
    ...(plan.defaultSubtitleStreamIndex !== undefined ? { subtitleStreamIndex: plan.defaultSubtitleStreamIndex } : {}),
  };
  if (plan.delivery === "hls") {
    const origin = checkedUrl(plan.serverUrl).origin;
    requireOrigin(plan.streamUrl, origin);
    requireTrackOrigins(tracks, origin);
    return { kind: "hls", masterUrl: plan.streamUrl, serverUrl: plan.serverUrl, mediaKind: plan.mediaKind, ...common };
  }
  const origin = checkedUrl(plan.streamUrl).origin;
  requireTrackOrigins(tracks, origin);
  return { kind: "original", url: plan.streamUrl, ...common };
}

function copyTrack(track: MediaTrack): MediaTrack {
  const copy: MediaTrack = { index: track.index, type: track.type, displayTitle: track.displayTitle, external: track.external };
  if (track.codec !== undefined) copy.codec = track.codec;
  if (track.language !== undefined) copy.language = track.language;
  if (track.deliveryUrl !== undefined) copy.deliveryUrl = track.deliveryUrl;
  if (track.title !== undefined) copy.title = track.title;
  if (track.channels !== undefined) copy.channels = track.channels;
  if (track.isDefault !== undefined) copy.isDefault = track.isDefault;
  if (track.isForced !== undefined) copy.isForced = track.isForced;
  if (track.isHearingImpaired !== undefined) copy.isHearingImpaired = track.isHearingImpaired;
  return copy;
}

function requireTrackOrigins(tracks: readonly MediaTrack[], origin: string): void {
  for (const track of tracks) {
    if (track.deliveryUrl !== undefined) requireOrigin(track.deliveryUrl, origin);
  }
}

function requireOrigin(value: unknown, origin: string): void {
  if (checkedUrl(value).origin !== origin) throw new LaunchRefusedError();
}

// An absolute http or https URL with no user info and no credential query. A value that does not parse is
// refused with a fresh error, so the parser's own error (which holds the input) never leaves this module.
function checkedUrl(value: unknown): URL {
  if (typeof value !== "string") throw new LaunchRefusedError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LaunchRefusedError();
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new LaunchRefusedError();
  if (url.username !== "" || url.password !== "") throw new LaunchRefusedError();
  for (const name of url.searchParams.keys()) {
    if (isCredentialQueryName(name)) throw new LaunchRefusedError();
  }
  return url;
}
