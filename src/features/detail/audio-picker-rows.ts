import type { MediaTrack } from "../../domain/playback";
import type { AudioPickerView } from "../../domain/audio-picker";
import { trackFactsFromPlan, trackRow } from "../player/chrome/track-label";
import type { PickerOption } from "../shared/ui";
import { channelLabel, codecName } from "./format";

// The rows of the title page's audio Picker. A row reads like the player's audio menu row for the same
// stream (P13-29), so the page and the player name a track the same way.
export function audioPickerOptions(view: AudioPickerView): PickerOption[] {
  return view.tracks.map((track) => {
    const index = track.index ?? 0;
    const facts = trackFactsFromPlan({
      index,
      type: "Audio",
      displayTitle: track.title ?? `Audio ${index}`,
      codec: track.codec,
      language: track.language,
      external: Boolean(track.isExternal),
      ...(track.streamTitle ? { title: track.streamTitle } : {}),
      ...(track.channels ? { channels: track.channels } : {}),
      ...(track.isDefault ? { isDefault: true } : {}),
    } satisfies MediaTrack);
    const row = trackRow(facts);
    return {
      value: String(index),
      label: row.name,
      ...(row.detail ? { description: row.detail } : {}),
      triggerLabel: triggerLabel(row.name, track.codec, track.channels),
    };
  });
}

// The name, then the codec and channels unless the name already says the codec.
function triggerLabel(name: string, codec: string | undefined, channels: number | undefined): string {
  const codecText = codecName(codec);
  if (codecText && name.toLowerCase().includes(codecText.toLowerCase())) return name;
  const format = [codecText, channelLabel(channels)].filter(Boolean).join(" ");
  return format ? `${name} · ${format}` : name;
}
