// The source decision function (ARCHITECTURE.md §3, decision 0002): each
// media source from a PlaybackInfo answer becomes DirectPlay, DirectStream,
// Transcode, a forced-fallback request, or a typed refusal. Rules run in
// order and the first that decides wins.
import { CONVERSION_REASONS, type ConversionReason, type RefusalReason } from "../../domain/playback";
import { rebuildMasterUrl, type HlsMediaKind } from "./hls-url";
import type { MediaSourceDto, MediaStreamDto } from "./types";

export interface IdentifiedSource extends MediaSourceDto {
  Id: string;
}

export interface DirectPlaySource extends IdentifiedSource {
  Path: string;
}

export type SourceDecision =
  | { kind: "direct-play"; source: DirectPlaySource }
  | {
    kind: "convert";
    source: IdentifiedSource;
    playMethod: "DirectStream" | "Transcode";
    masterUrl: string;
    mediaKind: HlsMediaKind;
    conversionReasons: ConversionReason[];
  }
  // A disc folder or ISO the server offered for direct play: ask again for
  // this source with EnableDirectPlay false (rule 4).
  | { kind: "force-fallback"; source: IdentifiedSource; reason: "disc-source" | "iso-source" }
  | { kind: "refused"; reason: RefusalReason; detail?: string };

export interface SourceContext {
  // The normalized signed-in server URL, without a trailing slash.
  serverUrl: string;
  itemId: string;
  // The PlaybackInfo answer's PlaySessionId, which the TranscodingUrl must repeat.
  playSessionId?: string;
}

// A Static=true request for a disc folder makes the server start ffmpeg, so
// disc folders and ISOs never direct play.
const DISC_VIDEO_TYPES = new Set(["bluray", "dvd"]);
const DISC_FOLDER_PATH = /(^|\/)(BDMV|VIDEO_TS)(\/|$)/i;
const ISO_PATH = /\.iso$/i;

// Reasons that change only the container, so the server can copy both
// streams (ARCHITECTURE.md §3 rule 5).
const CONTAINER_ONLY_REASONS: ReadonlySet<ConversionReason> = new Set([
  "ContainerNotSupported",
  "VideoCodecTagNotSupported",
]);
const KNOWN_REASONS: ReadonlySet<string> = new Set(CONVERSION_REASONS);

function discKind(source: MediaSourceDto): "disc-source" | "iso-source" | undefined {
  // The path checks back up VideoType in case a server mislabels a disc.
  const videoType = source.VideoType?.toLowerCase();
  const path = source.Path?.replace(/\\/g, "/") ?? "";
  if ((videoType && DISC_VIDEO_TYPES.has(videoType)) || DISC_FOLDER_PATH.test(path)) return "disc-source";
  if (videoType === "iso" || ISO_PATH.test(path)) return "iso-source";
  return undefined;
}

export function decideSource(source: MediaSourceDto, context: SourceContext): SourceDecision {
  // Rule 1.
  if (!source.Id) return refused("missing-source-data", "Id");
  const identified: IdentifiedSource = { ...source, Id: source.Id };
  // Rule 2: a source that must be opened first is a live stream.
  if (source.RequiresOpening === true) return refused("live-source");

  const disc = discKind(source);
  const offersDirectPlay = source.SupportsDirectPlay === true;
  // Rule 3.
  if (offersDirectPlay && !disc && source.Protocol === "File" && source.Path && !source.TranscodingUrl) {
    return { kind: "direct-play", source: { ...identified, Path: source.Path } };
  }
  // Rule 4.
  if (offersDirectPlay && disc && !source.TranscodingUrl) {
    return { kind: "force-fallback", source: identified, reason: disc };
  }
  // Rule 5.
  if (source.TranscodingUrl) return decideConversion(identified, source.TranscodingUrl, context);
  // Rule 6.
  if (offersDirectPlay && source.Protocol !== "File") {
    return refused("not-a-file", source.Protocol ?? "missing protocol");
  }
  if (offersDirectPlay) return refused("missing-source-data", "Path");
  // The server offers neither direct play nor a conversion, for example
  // because the user may not transcode or remux. Both servers send no
  // ErrorCode in that case (P10-02 fixtures), so none is required here.
  return refused("conversion-not-allowed");
}

function decideConversion(source: IdentifiedSource, transcodingUrl: string, context: SourceContext): SourceDecision {
  if (source.TranscodingSubProtocol?.toLowerCase() !== "hls") return refused("unsafe-transcoding-url", "not HLS");
  const rebuilt = rebuildMasterUrl(transcodingUrl, { ...context, mediaSourceId: source.Id, mediaKind: mediaKindOf(source) });
  if (!rebuilt.ok) return refused("unsafe-transcoding-url", rebuilt.detail);
  const raw = (param(rebuilt.params, "TranscodeReasons") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const conversionReasons = raw.filter((value): value is ConversionReason => KNOWN_REASONS.has(value));
  const directStream = conversionReasons.length === raw.length
    && copiesEverything(source, rebuilt.kind, rebuilt.params, conversionReasons);
  return {
    kind: "convert",
    source,
    playMethod: directStream ? "DirectStream" : "Transcode",
    masterUrl: rebuilt.url,
    mediaKind: rebuilt.kind,
    conversionReasons,
  };
}

// Audio only for a source with audio and no sign of video; a disc folder
// has a VideoType but no probed streams, so it stays `videos`.
function mediaKindOf(source: MediaSourceDto): HlsMediaKind {
  const audioOnly = !source.VideoType
    && streamsOf(source, "Video").length === 0
    && streamsOf(source, "Audio").length > 0;
  return audioOnly ? "audio" : "videos";
}

// Query names are matched case-insensitively, as ASP.NET binds them.
function param(params: URLSearchParams, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of params) {
    if (key.toLowerCase() === wanted) return value.trim();
  }
  return undefined;
}

function codecList(params: URLSearchParams, name: string): string[] {
  return (param(params, name) ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function isTrue(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

// A limit in the URL that the source exceeds, or that cannot be compared
// because the source value is unknown, means the server may re-encode.
function exceeds(limit: string | undefined, actual: number | null | undefined, slack = 0): boolean {
  if (limit === undefined) return false;
  const value = Number(limit);
  if (!Number.isFinite(value)) return true;
  return actual == null || actual > value + slack;
}

function streamsOf(source: MediaSourceDto, type: string): MediaStreamDto[] {
  return (source.MediaStreams ?? []).filter((stream) => stream.Type === type);
}

// DirectStream only when the URL shows that the server copies video and
// audio; anything uncertain is Transcode, so Fluster never claims original
// quality it cannot show (decision 0002 "Never silent"). The limits mirror
// Jellyfin's EncodingHelper.CanStreamCopyVideo and CanStreamCopyAudio
// (v10.11.7 lines 2317-2560), read from the URL the server will be sent. The
// rules and their fixture evidence are in the plan 002 decision log (P10-03).
function copiesEverything(
  source: IdentifiedSource,
  kind: HlsMediaKind,
  params: URLSearchParams,
  reasons: ConversionReason[],
): boolean {
  // An absent TranscodeReasons (the BluRay folder on both servers) says
  // nothing about what is copied.
  if (reasons.length === 0 || !reasons.every((reason) => CONTAINER_ONLY_REASONS.has(reason))) return false;
  if (param(params, "AllowVideoStreamCopy")?.toLowerCase() === "false") return false;
  if (param(params, "AllowAudioStreamCopy")?.toLowerCase() === "false") return false;
  // Burned-in subtitles re-encode the video.
  if (param(params, "SubtitleMethod")?.toLowerCase() === "encode") return false;
  if (isTrue(param(params, "AlwaysBurnInSubtitleWhenTranscoding"))) return false;
  if (isTrue(param(params, "RequireAvc"))) return false;

  if (kind === "videos") {
    const [video, ...others] = streamsOf(source, "Video");
    if (!video?.Codec || others.length > 0) return false;
    if (!codecList(params, "VideoCodec").includes(video.Codec.toLowerCase())) return false;
    if (exceeds(param(params, "VideoBitrate"), video.BitRate)) return false;
    if (exceeds(param(params, "MaxWidth"), video.Width)) return false;
    if (exceeds(param(params, "MaxHeight"), video.Height)) return false;
    if (exceeds(param(params, "MaxFramerate") ?? param(params, "Framerate"), video.ReferenceFrameRate, 0.05)) return false;
  }

  const audioStreams = streamsOf(source, "Audio");
  if (audioStreams.length === 0) return true;
  // StreamBuilder narrows AudioCodec to the one source codec only when it
  // copies that stream; otherwise it lists the profile's codecs.
  const audioIndex = Number(param(params, "AudioStreamIndex") ?? source.DefaultAudioStreamIndex ?? Number.NaN);
  const audio = audioStreams.find((stream) => stream.Index === audioIndex);
  const audioCodec = audio?.Codec?.toLowerCase();
  const audioCodecs = codecList(params, "AudioCodec");
  if (!audio || !audioCodec || audioCodecs.length !== 1 || audioCodecs[0] !== audioCodec) return false;
  if (exceeds(param(params, "AudioBitrate"), audio.BitRate)) return false;
  if (exceeds(param(params, "AudioSampleRate"), audio.SampleRate)) return false;
  return true;
}

function rank(decision: SourceDecision): number {
  switch (decision.kind) {
    case "direct-play":
      return 0;
    case "convert":
      return decision.playMethod === "DirectStream" ? 1 : 2;
    case "force-fallback":
      return 3;
    case "refused":
      return 4;
  }
}

// Picks the requested version, or the best source: the first DirectPlay,
// then the first DirectStream, then the first Transcode, then the first that
// needs the forced fallback. When nothing plays, the first refusal explains
// why. A requested MediaSourceId is never replaced by another version.
export function selectSource(
  sources: MediaSourceDto[] | null | undefined,
  context: SourceContext,
  mediaSourceId?: string,
): SourceDecision {
  const candidates = mediaSourceId
    ? (sources ?? []).filter((source) => source.Id === mediaSourceId)
    : (sources ?? []);
  if (candidates.length === 0) {
    return refused("no-sources", mediaSourceId ? "requested version not returned" : undefined);
  }
  const decisions = candidates.map((source) => decideSource(source, context));
  return decisions.reduce((best, decision) => (rank(decision) < rank(best) ? decision : best));
}

function refused(reason: RefusalReason, detail?: string): SourceDecision {
  return detail === undefined ? { kind: "refused", reason } : { kind: "refused", reason, detail };
}
