// The DeviceProfile Fluster sends with every PlaybackInfo request
// (ARCHITECTURE.md §3, decision 0002). Jellyfin runs its direct-play checks
// and fills in subtitle DeliveryUrl values only when a profile is present.
// The profile accepts every container and codec for direct play, so a codec
// never causes a conversion, and offers one HLS target per media type for
// the fallback. It has no codec or container conditions and no `Hls`
// subtitle method: HLS subtitle renditions carry ApiKey={token}.

export interface DirectPlayProfile {
  readonly Type: "Video" | "Audio";
}

// fMP4 segments, so HEVC and AV1 can be stream-copied. The lists are the
// ones the P10-02 contract fixtures were recorded with.
export interface TranscodingProfile {
  readonly Type: "Video" | "Audio";
  readonly Container: "mp4";
  readonly Protocol: "hls";
  readonly Context: "Streaming";
  readonly VideoCodec?: string;
  readonly AudioCodec: string;
  readonly EnableSubtitlesInManifest?: false;
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
  readonly TranscodingProfiles: readonly TranscodingProfile[];
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
  TranscodingProfiles: Object.freeze([
    Object.freeze({
      Type: "Video" as const,
      Container: "mp4" as const,
      Protocol: "hls" as const,
      Context: "Streaming" as const,
      VideoCodec: "h264,hevc,av1,vp9",
      AudioCodec: "aac,ac3,eac3,opus,flac,mp3",
      EnableSubtitlesInManifest: false as const,
    }),
    Object.freeze({
      Type: "Audio" as const,
      Container: "mp4" as const,
      Protocol: "hls" as const,
      Context: "Streaming" as const,
      AudioCodec: "aac",
    }),
  ]),
  ContainerProfiles: Object.freeze([]),
  CodecProfiles: Object.freeze([]),
  SubtitleProfiles: Object.freeze([
    ...subtitleProfiles(EXTERNAL_SUBTITLE_FORMATS, "External"),
    ...subtitleProfiles(EMBEDDED_SUBTITLE_FORMATS, "Embed"),
  ]),
});
