import type {
  AudioInfo,
  DynamicRange,
  ImageRef,
  ItemDetail,
  ItemVersion,
  SubtitleInfo,
  VideoInfo,
} from "../../domain/catalog";
import type { BaseItemDto, MediaSourceDto, MediaStreamDto } from "./types";

const CAST_LIMIT = 8;

// VideoRangeType values are listed in @jellyfin/sdk 1.0.2 models/video-range-type.d.ts.
function rangeFromType(type: string | null | undefined): DynamicRange | undefined {
  switch (type) {
    case "SDR":
      return "SDR";
    case "HDR10":
      return "HDR10";
    case "HDR10Plus":
      return "HDR10+";
    case "HLG":
      return "HLG";
    case "DOVI":
    case "DOVIWithEL":
    case "DOVIInvalid":
      return "Dolby Vision";
    case "DOVIWithHDR10":
      return "Dolby Vision / HDR10";
    case "DOVIWithHDR10Plus":
    case "DOVIWithELHDR10Plus":
      return "Dolby Vision / HDR10+";
    case "DOVIWithHLG":
      return "Dolby Vision / HLG";
    case "DOVIWithSDR":
      return "Dolby Vision / SDR";
    default:
      return undefined;
  }
}

// Prefer VideoRangeType; fall back to VideoRange, then to the color transfer
// characteristic (smpte2084 is PQ, arib-std-b67 is HLG).
export function dynamicRangeOf(stream: MediaStreamDto): DynamicRange {
  const fromType = rangeFromType(stream.VideoRangeType);
  if (fromType) return fromType;
  switch (stream.ColorTransfer) {
    case "smpte2084":
      return "HDR10";
    case "arib-std-b67":
      return "HLG";
  }
  switch (stream.VideoRange) {
    case "HDR":
      return "HDR";
    case "SDR":
      return "SDR";
    default:
      return "Unknown";
  }
}

function toVideo(stream: MediaStreamDto): VideoInfo {
  return {
    ...(stream.Codec ? { codec: stream.Codec } : {}),
    ...(stream.Profile ? { profile: stream.Profile } : {}),
    ...(stream.Width ? { width: stream.Width } : {}),
    ...(stream.Height ? { height: stream.Height } : {}),
    ...(stream.BitDepth ? { bitDepth: stream.BitDepth } : {}),
    hdr: dynamicRangeOf(stream),
  };
}

function toAudio(stream: MediaStreamDto): AudioInfo {
  return {
    ...(stream.Language ? { language: stream.Language } : {}),
    ...(stream.Codec ? { codec: stream.Codec } : {}),
    ...(stream.Channels ? { channels: stream.Channels } : {}),
    ...(stream.ChannelLayout ? { channelLayout: stream.ChannelLayout } : {}),
    ...(stream.DisplayTitle ? { title: stream.DisplayTitle } : {}),
    isDefault: Boolean(stream.IsDefault),
  };
}

function toSubtitle(stream: MediaStreamDto): SubtitleInfo {
  return {
    ...(stream.Language ? { language: stream.Language } : {}),
    ...(stream.Codec ? { codec: stream.Codec } : {}),
    ...(stream.DisplayTitle ? { title: stream.DisplayTitle } : {}),
    isExternal: Boolean(stream.IsExternal),
    isDefault: Boolean(stream.IsDefault),
    isForced: Boolean(stream.IsForced),
  };
}

function toVersion(source: MediaSourceDto, position: number): ItemVersion | undefined {
  if (!source.Id) return undefined;
  const streams = source.MediaStreams ?? [];
  const video = streams.find((stream) => stream.Type === "Video");
  return {
    id: source.Id,
    name: source.Name || `Version ${position + 1}`,
    ...(source.Container ? { container: source.Container } : {}),
    ...(source.Size ? { sizeBytes: source.Size } : {}),
    ...(video ? { video: toVideo(video) } : {}),
    audio: streams.filter((stream) => stream.Type === "Audio").map(toAudio),
    subtitles: streams.filter((stream) => stream.Type === "Subtitle").map(toSubtitle),
  };
}

function image(itemId: string, type: "Primary" | "Backdrop", tag: string | null | undefined, hashes: BaseItemDto["ImageBlurHashes"]): ImageRef | undefined {
  if (!tag) return undefined;
  const blurHash = hashes?.[type]?.[tag];
  return blurHash ? { itemId, type, tag, blurHash } : { itemId, type, tag };
}

export function toItemDetail(item: BaseItemDto): ItemDetail | undefined {
  if (!item.Id || !item.Name) return undefined;
  const isEpisode = item.Type === "Episode";
  const episodeLabel = isEpisode && item.ParentIndexNumber != null && item.IndexNumber != null
    ? `Season ${item.ParentIndexNumber}, Episode ${item.IndexNumber}`
    : undefined;
  const poster = image(item.Id, "Primary", item.ImageTags?.Primary, item.ImageBlurHashes);
  const backdrop = image(item.Id, "Backdrop", item.BackdropImageTags?.[0], item.ImageBlurHashes);
  const cast = (item.People ?? [])
    .filter((person) => person.Name && person.Type === "Actor")
    .slice(0, CAST_LIMIT)
    .map((person) => ({ name: person.Name!, ...(person.Role ? { role: person.Role } : {}) }));
  return {
    id: item.Id,
    type: item.Type ?? "",
    title: item.Name,
    ...(item.SeriesName ? { seriesName: item.SeriesName } : {}),
    ...(episodeLabel ? { episodeLabel } : {}),
    ...(item.ProductionYear != null ? { year: item.ProductionYear } : {}),
    ...(item.RunTimeTicks ? { runTimeTicks: item.RunTimeTicks } : {}),
    ...(item.Overview ? { overview: item.Overview } : {}),
    genres: item.Genres ?? [],
    cast,
    userData: {
      played: Boolean(item.UserData?.Played),
      favorite: Boolean(item.UserData?.IsFavorite),
      resumePositionTicks: Math.max(0, item.UserData?.PlaybackPositionTicks ?? 0),
    },
    versions: (item.MediaSources ?? []).flatMap((source, position) => toVersion(source, position) ?? []),
    ...(poster ? { poster } : {}),
    ...(backdrop ? { backdrop } : {}),
  };
}
