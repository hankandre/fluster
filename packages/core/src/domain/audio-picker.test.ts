import { describe, expect, it } from "vitest";
import { audioPickerView } from "./audio-picker";
import type { AudioInfo } from "./catalog";
import type { LanguageCulture } from "./languages";

const NAMES: Record<string, string> = { eng: "English", spa: "Spanish", deu: "German", ger: "German", fra: "French", jpn: "Japanese", zho: "Chinese" };
const languageLabel = (code: string) => NAMES[code] ?? code;
const cultures: LanguageCulture[] = [
  { displayName: "German", threeLetterName: "deu", threeLetterNames: ["ger", "deu"], twoLetterName: "de" },
  { displayName: "English", threeLetterName: "eng", threeLetterNames: ["eng"], twoLetterName: "en" },
];

function track(index: number, language: string | undefined, isDefault = false): AudioInfo {
  return { index, ...(language ? { language } : {}), isDefault };
}

const eng = track(1, "eng", true);
const spa = track(2, "spa");
const deu = track(3, "deu");
const fra = track(4, "fra");

function order(view: ReturnType<typeof audioPickerView>) {
  return view?.tracks.map((t) => t.index);
}

describe("audioPickerView", () => {
  it("is undefined with fewer than two indexed tracks", () => {
    expect(audioPickerView([eng], { languageLabel })).toBeUndefined();
    expect(audioPickerView([eng, { isDefault: false, language: "spa" }], { languageLabel })).toBeUndefined();
    expect(audioPickerView([], { languageLabel })).toBeUndefined();
  });

  it("with no preference, opens on the server's start track and lists the languages alphabetically by name", () => {
    const view = audioPickerView([spa, eng, fra, deu], { defaultAudioStreamIndex: 1, languageLabel });
    expect(view).toMatchObject({ openingIndex: 1, serverStartIndex: 1, elevated: false });
    // English, French, German, Spanish by name.
    expect(order(view)).toEqual([1, 4, 3, 2]);
  });

  it("orders by the language's name, not its code", () => {
    // zho (Chinese) sorts before deu (German) by name; by code it would come last.
    const view = audioPickerView([track(1, "deu", true), track(2, "zho")], { languageLabel });
    expect(order(view)).toEqual([2, 1]);
  });

  it("elevates the preferred language, matching ger against deu through the cultures", () => {
    const view = audioPickerView([eng, spa, deu], { preference: "ger", cultures, languageLabel });
    expect(view).toMatchObject({ elevated: true, openingIndex: 3, serverStartIndex: 1 });
    expect(order(view)).toEqual([3, 1, 2]);
  });

  it("with a preference no track matches, nothing is elevated and the server's start track opens", () => {
    const view = audioPickerView([eng, spa], { preference: "jpn", cultures, languageLabel, defaultAudioStreamIndex: 2 });
    expect(view).toMatchObject({ elevated: false, openingIndex: 2, serverStartIndex: 2 });
    expect(order(view)).toEqual([1, 2]);
  });

  it("treats OriginalLanguage as matching nothing", () => {
    const view = audioPickerView([spa, eng], { preference: "OriginalLanguage", cultures, languageLabel });
    expect(view?.elevated).toBe(false);
  });

  it("opens on the server's start track when it is in the preferred language", () => {
    const second = track(5, "eng");
    const view = audioPickerView([eng, spa, second], { preference: "eng", languageLabel, defaultAudioStreamIndex: 5 });
    expect(view).toMatchObject({ elevated: true, openingIndex: 5 });
    // Preferred tracks keep file order.
    expect(order(view)).toEqual([1, 5, 2]);
  });

  it("opens on the first preferred track in file order when the server starts elsewhere", () => {
    const view = audioPickerView([eng, track(5, "spa"), spa], { preference: "spa", languageLabel, defaultAudioStreamIndex: 1 });
    expect(view).toMatchObject({ elevated: true, openingIndex: 5 });
    expect(order(view)).toEqual([5, 2, 1]);
  });

  it("lists untagged and und tracks last, in file order", () => {
    const view = audioPickerView([track(1, undefined, true), spa, track(3, "und"), track(4, "eng")], { languageLabel });
    expect(order(view)).toEqual([4, 2, 1, 3]);
  });

  it("falls back to the flagged default, then the first track, when the server names none", () => {
    expect(audioPickerView([spa, track(7, "eng", true)], { languageLabel })?.serverStartIndex).toBe(7);
    expect(audioPickerView([spa, deu], { languageLabel })?.serverStartIndex).toBe(2);
    expect(audioPickerView([spa, deu], { languageLabel, defaultAudioStreamIndex: 99 })?.serverStartIndex).toBe(2);
  });
});
