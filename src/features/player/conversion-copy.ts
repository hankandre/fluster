import type { ConversionReason, PlaybackPlan } from "../../domain/playback";

// Plain-language reasons, written to follow "Converting on server: ". A
// Record keyed by reason, so a new TranscodeReason fails compilation until it
// has copy.
export const CONVERSION_REASON_COPY: Record<ConversionReason, string> = {
  ContainerNotSupported: "the file format is not supported here",
  VideoCodecNotSupported: "the video format is not supported here",
  AudioCodecNotSupported: "the audio format is not supported here",
  SubtitleCodecNotSupported: "the subtitle format is not supported here",
  AudioIsExternal: "the audio is a separate file",
  SecondaryAudioNotSupported: "this audio track cannot play alongside the video",
  StreamCountExceedsLimit: "the file has more streams than this player handles",
  VideoProfileNotSupported: "the video profile is not supported here",
  VideoRangeTypeNotSupported: "the video's colour range (HDR) is not supported here",
  VideoCodecTagNotSupported: "the video is labelled in a way this player does not accept",
  VideoLevelNotSupported: "the video level is higher than this player supports",
  VideoResolutionNotSupported: "the video resolution is higher than this player supports",
  VideoBitDepthNotSupported: "the video's colour depth is not supported here",
  VideoFramerateNotSupported: "the video's frame rate is not supported here",
  VideoRotationNotSupported: "the video is rotated in a way this player does not support",
  RefFramesNotSupported: "the video uses more reference frames than this player supports",
  AnamorphicVideoNotSupported: "the video is stretched (anamorphic), which is not supported here",
  InterlacedVideoNotSupported: "the video is interlaced, which is not supported here",
  AudioChannelsNotSupported: "the audio has more channels than this player supports",
  AudioProfileNotSupported: "the audio profile is not supported here",
  AudioSampleRateNotSupported: "the audio sample rate is not supported here",
  AudioBitDepthNotSupported: "the audio bit depth is not supported here",
  ContainerBitrateExceedsLimit: "the file is over your streaming limit",
  VideoBitrateNotSupported: "the video bitrate is too high for this connection",
  AudioBitrateNotSupported: "the audio bitrate is too high for this connection",
  UnknownVideoStreamInfo: "the server could not read the video details",
  UnknownAudioStreamInfo: "the server could not read the audio details",
  DirectPlayError: "playing the original file failed",
};

// The server sent no reason (a disc folder, for example).
export const NO_REASON_COPY = "the server needs to convert this file";

// Bitrate limits are the reasons a viewer can change, so they lead the chip.
const LEADING_REASONS: readonly ConversionReason[] = [
  "ContainerBitrateExceedsLimit",
  "VideoBitrateNotSupported",
  "AudioBitrateNotSupported",
];

export function reasonCopy(reasons: readonly ConversionReason[]): string[] {
  return reasons.length === 0 ? [NO_REASON_COPY] : reasons.map((reason) => CONVERSION_REASON_COPY[reason]);
}

function leadingReason(reasons: readonly ConversionReason[]): string {
  const lead = LEADING_REASONS.find((reason) => reasons.includes(reason)) ?? reasons[0];
  return lead === undefined ? NO_REASON_COPY : CONVERSION_REASON_COPY[lead];
}

export interface ConversionIndicator {
  // The chip text. Absent for direct play: nothing is shown.
  chip: string;
  // Every reason, for the information panel.
  reasons: string[];
  subtitlesBurnedIn: boolean;
}

export const BURNED_IN_COPY = "Subtitles are burned in";

export function conversionIndicator(plan: PlaybackPlan | undefined): ConversionIndicator | undefined {
  if (!plan || plan.delivery === "static") return undefined;
  const lead = leadingReason(plan.conversionReasons);
  const chip = plan.playMethod === "DirectStream"
    ? `Repackaging on server, original quality: ${lead}`
    : `Converting on server: ${lead}`;
  return { chip, reasons: reasonCopy(plan.conversionReasons), subtitlesBurnedIn: plan.subtitlesBurnedIn === true };
}
