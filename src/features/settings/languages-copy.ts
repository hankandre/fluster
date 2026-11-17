import type { AudioChoice, SubtitleChoice } from "../../domain/account-language-choices";
import type { PickerOption } from "../shared/ui";

// The words of the Languages section (DESIGN.md 10). Choices come from the domain; nothing here decides what plays.

export const LANGUAGES_INTRO = "Saved to your Jellyfin account, so your other Jellyfin apps use them too. Every other setting stays on this computer.";
export const AUDIO_LABEL = "Audio";
export const AUDIO_PICKER_LABEL = "Audio language";
export const SUBTITLE_LABEL = "Subtitles";
export const SUBTITLE_PICKER_LABEL = "Subtitle language";
export const LOADING = "Loading";
export const READ_FAILED = "Couldn't load your languages.";
export const REFUSED = "Your server didn't accept this change from Fluster. Change it in Jellyfin.";
export const AUDIO_SAVE_FAILED = "Couldn't save your audio language. Try again.";
export const SUBTITLE_SAVE_FAILED = "Couldn't save your subtitle language. Try again.";

const OTHER_APP = "Set in another Jellyfin app";
const DEFAULT_OFF = "Play default audio track is off in your Jellyfin account.";

const SMART = "when the audio is in another language";

export function audioLabel(choice: AudioChoice): string {
  switch (choice.kind) {
    case "default":
      return "The file's default";
    case "original":
      return "Original language";
    case "language":
      return choice.language.name;
    default:
      return choice.kind === "unknown-code" && choice.code ? choice.code : OTHER_APP;
  }
}

export function subtitleLabel(choice: SubtitleChoice): string {
  switch (choice.kind) {
    case "off":
      return "Off";
    case "default":
      return "The file's default";
    case "smart":
      return `${choice.language.name}, ${SMART}`;
    case "always":
      return `${choice.language.name}, always`;
    case "forced-only":
      return `${choice.name ?? choice.code}, forced subtitles only`;
    case "unknown-code":
      return `${choice.code}, ${choice.mode === "Smart" ? SMART : "always"}`;
    default:
      return OTHER_APP;
  }
}

export function audioDescription(choice: AudioChoice): string {
  switch (choice.kind) {
    case "default":
      return "Plays the audio track each file marks as its default.";
    case "original":
      return `Plays the film's original language when your server knows it, otherwise the file's default track. ${DEFAULT_OFF}`;
    case "language":
      return `Plays ${choice.language.name} when a title has it. ${DEFAULT_OFF}`;
    default:
      return `${OTHER_APP}. Choose one here to change it.`;
  }
}

export function subtitleDescription(choice: SubtitleChoice): string {
  switch (choice.kind) {
    case "off":
      return "No subtitles when a title starts. You can turn them on while watching.";
    case "default":
      return "Shows the subtitle track each file marks as its default.";
    case "smart":
      return `${choice.language.name} subtitles when the audio is in another language; only forced ${choice.language.name} subtitles otherwise.`;
    case "always":
      return `${choice.language.name} subtitles whenever a title has them.`;
    default:
      return `${OTHER_APP}. Choose one here to change it.`;
  }
}

export function audioOptions(choices: readonly AudioChoice[]): PickerOption[] {
  return choices.map((choice) => ({ value: choice.value, label: audioLabel(choice) }));
}

export function subtitleOptions(choices: readonly SubtitleChoice[]): PickerOption[] {
  return choices.map((choice) => ({ value: choice.value, label: subtitleLabel(choice) }));
}

export const audioSaved = (label: string) => `Audio set to ${label}.`;
export const subtitleSaved = (label: string) => `Subtitles set to ${label}.`;
