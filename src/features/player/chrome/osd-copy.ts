import { BURNED_IN_COPY } from "../conversion-copy";

// The words on the on-screen pill. Pure, so the key handler and the tests share them.
const MINUS = "−";

export function seekCopy(seconds: number): string {
  return `${seconds < 0 ? MINUS : "+"}${Math.abs(seconds)} s`;
}

export function volumeCopy(volume: number): string {
  return `Volume ${Math.round(volume)}%`;
}

export const MUTED_COPY = "Muted";
export const START_COPY = "Start";
export const END_COPY = "End";
export const NO_SUBTITLES_COPY = "No subtitles";
export const SUBTITLES_OFF_COPY = "Subtitles: Off";

// The title of the subtitle just chosen; undefined for off, null when there are none.
export function subtitleCopy(title: string | undefined | null): string {
  if (title === null) return NO_SUBTITLES_COPY;
  return title === undefined ? SUBTITLES_OFF_COPY : `Subtitles: ${title}`;
}

// A jump to a share of the file by number key: "30%".
export function fractionCopy(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

// The conversion line shown at the start of a converted session.
export function conversionCopy(chip: string, subtitlesBurnedIn: boolean): string {
  return subtitlesBurnedIn ? `${chip} \u00b7 ${BURNED_IN_COPY}` : chip;
}
