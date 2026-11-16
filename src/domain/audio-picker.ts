import type { AudioInfo } from "./catalog";
import { languageKey, type LanguageCulture } from "./languages";

// The title page's audio Picker (P17-08): which track it opens on and in what order it lists them.
export interface AudioPickerView {
  // In list order; only tracks that carry a Jellyfin index.
  tracks: AudioInfo[];
  // The track the Picker shows before any pick.
  openingIndex: number;
  // The track a play with no index is expected to start with (the server's own choice).
  serverStartIndex: number;
  // True when the account's preferred language has a track and those tracks are listed first.
  elevated: boolean;
}

export interface AudioPickerOptions {
  // Configuration.AudioLanguagePreference.
  preference?: string;
  cultures?: readonly LanguageCulture[];
  // The version's MediaSources[].DefaultAudioStreamIndex.
  defaultAudioStreamIndex?: number;
  languageLabel(code: string): string;
}

type IndexedAudio = AudioInfo & { index: number };

function isIndexed(track: AudioInfo): track is IndexedAudio {
  return typeof track.index === "number";
}

// Undefined with fewer than two indexed tracks: there is nothing to pick between.
export function audioPickerView(audio: readonly AudioInfo[], options: AudioPickerOptions): AudioPickerView | undefined {
  const indexed = audio.filter(isIndexed);
  if (indexed.length < 2) return undefined;

  const named = indexed.find((track) => track.index === options.defaultAudioStreamIndex);
  const serverStart = named ?? indexed.find((track) => track.isDefault) ?? indexed[0];
  const key = (track: AudioInfo) => languageKey(track.language, options.cultures);

  const wanted = languageKey(options.preference, options.cultures);
  const preferred = wanted === undefined ? [] : indexed.filter((track) => key(track) === wanted);
  const elevated = preferred.length > 0;
  const rest = elevated ? indexed.filter((track) => !preferred.includes(track)) : indexed;

  const openingIndex = elevated
    ? (preferred.includes(serverStart) ? serverStart : preferred[0]).index
    : serverStart.index;
  return {
    tracks: [...preferred, ...alphabetical(rest, key, options.languageLabel)],
    openingIndex,
    serverStartIndex: serverStart.index,
    elevated,
  };
}

// Groups by language, orders the groups by the language's name, keeps file order inside a group, and puts
// tracks with no language last.
function alphabetical(
  tracks: readonly IndexedAudio[],
  key: (track: AudioInfo) => string | undefined,
  languageLabel: (code: string) => string,
): IndexedAudio[] {
  const groups = new Map<string, IndexedAudio[]>();
  const untagged: IndexedAudio[] = [];
  for (const track of tracks) {
    const language = key(track);
    if (language === undefined) {
      untagged.push(track);
      continue;
    }
    groups.set(language, [...(groups.get(language) ?? []), track]);
  }
  const labelled = [...groups.entries()].map(([language, members]) => ({
    label: languageLabel(members[0].language ?? language),
    members,
  }));
  labelled.sort((a, b) => a.label.localeCompare(b.label, "en"));
  return [...labelled.flatMap((group) => group.members), ...untagged];
}
