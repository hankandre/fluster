import { CONVERSION_REASONS, type ConversionReason, type PlayMethod, type ServerPlayMethod } from "../../domain/playback";

// The fields Fluster reads from GET /Sessions (SessionInfoDto in
// @jellyfin/sdk 1.0.2: DeviceId, NowPlayingItem, PlayState with MediaSourceId
// and PlayMethod, TranscodingInfo with IsVideoDirect, IsAudioDirect, and
// TranscodeReasons). The DTO has no PlaySessionId, so a session is matched by
// device (the request already filters by it), item, and media source.
export interface SessionDto {
  DeviceId?: string | null;
  NowPlayingItem?: { Id?: string | null } | null;
  PlayState?: { MediaSourceId?: string | null; PlayMethod?: string | null } | null;
  TranscodingInfo?: {
    IsVideoDirect?: boolean;
    IsAudioDirect?: boolean;
    TranscodeReasons?: string[] | null;
  } | null;
}

const PLAY_METHODS: readonly string[] = ["DirectPlay", "DirectStream", "Transcode"];
const KNOWN_REASONS: ReadonlySet<string> = new Set(CONVERSION_REASONS);

function sameId(a: string | null | undefined, b: string): boolean {
  return typeof a === "string" && a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase();
}

// The running conversion of this device's session for the item and media
// source, or undefined when no such session has TranscodingInfo yet. The
// direct flags count only when the server sent them as true.
export function findSessionPlayMethod(
  sessions: readonly SessionDto[],
  deviceId: string,
  playing: { itemId: string; mediaSourceId: string },
): ServerPlayMethod | undefined {
  const session = sessions.find((candidate) => sameId(candidate.DeviceId, deviceId)
    && sameId(candidate.NowPlayingItem?.Id, playing.itemId)
    && sameId(candidate.PlayState?.MediaSourceId, playing.mediaSourceId));
  const info = session?.TranscodingInfo;
  if (!session || !info) return undefined;
  const method = session.PlayState?.PlayMethod;
  return {
    ...(method && PLAY_METHODS.includes(method) ? { playMethod: method as PlayMethod } : {}),
    videoDirect: info.IsVideoDirect === true,
    audioDirect: info.IsAudioDirect === true,
    reasons: (info.TranscodeReasons ?? []).filter((reason): reason is ConversionReason => KNOWN_REASONS.has(reason)),
  };
}
