import { describe, expect, it } from "vitest";
import { audioPickerView } from "../../domain/audio-picker";
import type { AudioInfo } from "../../domain/catalog";
import type { MediaTrack } from "../../domain/playback";
import { trackFactsFromPlan, trackRow } from "../player/chrome/track-label";
import { audioPickerOptions } from "./audio-picker-rows";
import { languageName } from "./format";

const audio: AudioInfo[] = [
  { index: 1, language: "eng", codec: "aac", channels: 2, title: "English - AAC - Stereo", isDefault: true },
  { index: 2, language: "spa", codec: "ac3", channels: 6, title: "Spanish - AC3 - 5.1", streamTitle: "Castilian", isDefault: false },
  { index: 3, codec: "truehd", channels: 8, streamTitle: "TrueHD Atmos 7.1", isDefault: false },
  { index: 4, language: "jpn", codec: "eac3", channels: 6, isExternal: true, isDefault: false },
];

function planTrack(track: AudioInfo): MediaTrack {
  return {
    index: track.index ?? 0,
    type: "Audio",
    displayTitle: track.title ?? `Audio ${track.index}`,
    codec: track.codec,
    language: track.language,
    external: Boolean(track.isExternal),
    ...(track.streamTitle ? { title: track.streamTitle } : {}),
    ...(track.channels ? { channels: track.channels } : {}),
    ...(track.isDefault ? { isDefault: true } : {}),
  };
}

describe("audioPickerOptions (P17-08)", () => {
  const view = audioPickerView(audio, { languageLabel: languageName, defaultAudioStreamIndex: 1 })!;
  const options = audioPickerOptions(view);

  it("rows equal the player's audio menu rows for the same stream", () => {
    expect(options).toHaveLength(view.tracks.length);
    view.tracks.forEach((track, position) => {
      const row = trackRow(trackFactsFromPlan(planTrack(track)));
      expect(options[position]).toMatchObject({ value: String(track.index), label: row.name, ...(row.detail ? { description: row.detail } : {}) });
    });
  });

  it("lists an untagged track last", () => {
    expect(options.at(-1)?.value).toBe("3");
  });

  it("the trigger adds the codec and channels unless the name already has the codec", () => {
    const byValue = (value: string) => options.find((option) => option.value === value);
    expect(byValue("1")?.triggerLabel).toBe("English · AAC Stereo");
    expect(byValue("2")?.triggerLabel).toBe("Spanish · Castilian · AC-3 5.1");
    expect(byValue("3")?.triggerLabel).toBe("TrueHD Atmos 7.1");
  });
});
