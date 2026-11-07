// The DeviceProfile Fluster sends with every PlaybackInfo request
// (ARCHITECTURE.md §3). Jellyfin runs its direct-play checks and fills in
// subtitle DeliveryUrl values only when a profile is present. The profile
// accepts every container and codec for direct play and offers no
// transcoding target, so the server has nothing to convert to.

export interface DirectPlayProfile {
  readonly Type: "Video" | "Audio";
}

export interface SubtitleProfile {
  readonly Format: string;
  readonly Method: "External" | "Embed";
}

export interface DeviceProfile {
  readonly Name: string;
  readonly MaxStreamingBitrate: number;
  readonly MaxStaticBitrate: number;
  readonly DirectPlayProfiles: readonly DirectPlayProfile[];
  readonly TranscodingProfiles: readonly never[];
  readonly ContainerProfiles: readonly never[];
  readonly CodecProfiles: readonly never[];
  readonly SubtitleProfiles: readonly SubtitleProfile[];
}

export const MAX_BITRATE = 1_000_000_000;

const EXTERNAL_SUBTITLE_FORMATS = ["srt", "ass", "ssa", "vtt", "sub", "pgssub"];
const EMBEDDED_SUBTITLE_FORMATS = ["srt", "ass", "ssa", "pgssub", "dvdsub", "vtt"];

function subtitleProfiles(formats: string[], method: SubtitleProfile["Method"]): SubtitleProfile[] {
  return formats.map((format) => Object.freeze({ Format: format, Method: method }));
}

export const FLUSTER_PROFILE: DeviceProfile = Object.freeze({
  Name: "Fluster",
  MaxStreamingBitrate: MAX_BITRATE,
  MaxStaticBitrate: MAX_BITRATE,
  DirectPlayProfiles: Object.freeze([
    Object.freeze({ Type: "Video" as const }),
    Object.freeze({ Type: "Audio" as const }),
  ]),
  TranscodingProfiles: Object.freeze([]),
  ContainerProfiles: Object.freeze([]),
  CodecProfiles: Object.freeze([]),
  SubtitleProfiles: Object.freeze([
    ...subtitleProfiles(EXTERNAL_SUBTITLE_FORMATS, "External"),
    ...subtitleProfiles(EMBEDDED_SUBTITLE_FORMATS, "Embed"),
  ]),
});
