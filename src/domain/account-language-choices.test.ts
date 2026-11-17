import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toLanguageCultures } from "../lib/jellyfin/account-languages";
import { applyChange, revertChange, audioChange, audioChoices, audioValueOf, languageOptions, subtitleChange, subtitleChoices, subtitleValueOf } from "./account-language-choices";
import type { LanguageCulture } from "./languages";

const root = join(__dirname, "../../tests/fixtures/jellyfin");
function culturesOf(version: string): LanguageCulture[] {
  return toLanguageCultures(JSON.parse(readFileSync(join(root, version, "account-language-cultures.json"), "utf8")));
}

describe.each([
  ["10.11.7", 187],
  ["12.4.0", 486],
] as const)("languageOptions, Jellyfin %s", (version, count) => {
  const cultures = culturesOf(version);
  const options = languageOptions(cultures);

  it(`gives ${count} languages`, () => {
    expect(options).toHaveLength(count);
  });

  it("merges zho, por, and spa and labels them by the first culture", () => {
    expect(options.filter((option) => ["zho", "por", "spa"].includes(option.code))).toHaveLength(3);
    expect(options.find((option) => option.code === "spa")?.name).toBe("Spanish; Castilian");
  });

  it("drops a name that is not three letters and sorts by label", () => {
    expect(options.some((option) => option.code === "qaa-qtz")).toBe(false);
    const names = options.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });
});

const cultures = culturesOf("10.11.7");

describe("audioChange and subtitleChange", () => {
  it("map each audio choice to exactly its fields", () => {
    expect(audioChange("default")).toEqual({ PlayDefaultAudioTrack: true });
    expect(audioChange("original")).toEqual({ AudioLanguagePreference: "OriginalLanguage", PlayDefaultAudioTrack: false });
    expect(audioChange("lang:fra")).toEqual({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false });
    expect(audioChange("current")).toBeUndefined();
  });

  it("map each subtitle choice to exactly its fields", () => {
    expect(subtitleChange("off")).toEqual({ SubtitleMode: "None" });
    expect(subtitleChange("default")).toEqual({ SubtitleMode: "Default" });
    expect(subtitleChange("smart:fra")).toEqual({ SubtitleLanguagePreference: "fra", SubtitleMode: "Smart" });
    expect(subtitleChange("always:fra")).toEqual({ SubtitleLanguagePreference: "fra", SubtitleMode: "Always" });
    expect(subtitleChange("current")).toBeUndefined();
  });

  it("revertChange puts back only the changed fields", () => {
    const previous = { audioLanguage: "deu", playDefaultAudioTrack: true, subtitleMode: "Default" };
    const current = { audioLanguage: "fra", playDefaultAudioTrack: false, subtitleMode: "None" };
    expect(revertChange(current, previous, { AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false })).toEqual({ audioLanguage: "deu", playDefaultAudioTrack: true, subtitleMode: "None" });
    expect(revertChange({ audioLanguage: "fra" }, {}, { AudioLanguagePreference: "fra" })).toEqual({});
  });

  it("applyChange sets only the changed fields", () => {
    expect(applyChange({ subtitleMode: "Default", audioLanguage: "deu" }, { AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false })).toEqual({
      subtitleMode: "Default",
      audioLanguage: "fra",
      playDefaultAudioTrack: false,
    });
  });
});

describe("audioValueOf", () => {
  it("shows the file's default whenever Play default audio track is on", () => {
    expect(audioValueOf({ playDefaultAudioTrack: true }, cultures).value).toBe("default");
    expect(audioValueOf({ playDefaultAudioTrack: true, audioLanguage: "deu" }, cultures).value).toBe("default");
  });

  it("shows Original language and a language, matching ger to German", () => {
    expect(audioValueOf({ playDefaultAudioTrack: false, audioLanguage: "OriginalLanguage" }, cultures).value).toBe("original");
    expect(audioValueOf({ playDefaultAudioTrack: false, audioLanguage: "ger" }, cultures).value).toBe("lang:deu");
  });

  it("shows a current-only entry for states no cell records", () => {
    expect(audioValueOf({ playDefaultAudioTrack: false }, cultures)).toMatchObject({ value: "current", kind: "other-app" });
    expect(audioValueOf({ audioLanguage: "deu" }, cultures)).toMatchObject({ value: "current", kind: "other-app" });
    expect(audioValueOf({ playDefaultAudioTrack: false, audioLanguage: "zzz" }, cultures)).toMatchObject({ value: "current", kind: "unknown-code", code: "zzz" });
  });
});

describe("subtitleValueOf", () => {
  it("maps each recorded mode", () => {
    expect(subtitleValueOf({ subtitleMode: "None" }, cultures).value).toBe("off");
    expect(subtitleValueOf({ subtitleMode: "Default" }, cultures).value).toBe("default");
    expect(subtitleValueOf({ subtitleMode: "Smart", subtitleLanguage: "ger" }, cultures).value).toBe("smart:deu");
    expect(subtitleValueOf({ subtitleMode: "Always", subtitleLanguage: "fra" }, cultures).value).toBe("always:fra");
  });

  it("shows forced-only and unknown reads as current-only entries", () => {
    expect(subtitleValueOf({ subtitleMode: "OnlyForced", subtitleLanguage: "fra" }, cultures)).toMatchObject({ value: "current", kind: "forced-only", code: "fra" });
    expect(subtitleValueOf({ subtitleMode: "Smart" }, cultures)).toMatchObject({ value: "current", kind: "other-app" });
    expect(subtitleValueOf({ subtitleMode: "Weird", subtitleLanguage: "fra" }, cultures)).toMatchObject({ value: "current", kind: "other-app" });
    expect(subtitleValueOf({ subtitleMode: "Always", subtitleLanguage: "zzz" }, cultures)).toMatchObject({ value: "current", kind: "unknown-code", code: "zzz" });
  });
});

describe("choices", () => {
  it("lists Original language second, or not at all by flag", () => {
    expect(audioChoices(cultures, {}, { originalLanguage: true }).slice(0, 3).map((c) => c.value)).toEqual(["current", "default", "original"]);
    expect(audioChoices(cultures, { playDefaultAudioTrack: true }, { originalLanguage: false }).some((c) => c.value === "original")).toBe(false);
  });

  it("offers only recorded choices", () => {
    const audio = audioChoices(cultures, { playDefaultAudioTrack: true }, { originalLanguage: true });
    expect(audio.filter((c) => c.value === "current")).toHaveLength(0);
    expect(audio.slice(0, 2).map((c) => c.value)).toEqual(["default", "original"]);
    expect(audio.slice(2).every((c) => c.kind === "language")).toBe(true);
    const subtitles = subtitleChoices(cultures, { subtitleMode: "None" });
    expect(subtitles.slice(0, 4).map((c) => c.value)).toEqual(["off", "default", expect.stringMatching(/^smart:/), expect.stringMatching(/^always:/)]);
    expect(subtitles.some((c) => c.value === "current")).toBe(false);
    expect(subtitles).toHaveLength(2 + 2 * 187);
    for (const choice of subtitles) if (choice.kind === "smart" || choice.kind === "always") expect(subtitleChange(choice.value)).toBeDefined();
  });

  it("puts a current-only entry first only when the read needs it", () => {
    expect(subtitleChoices(cultures, { subtitleMode: "OnlyForced", subtitleLanguage: "fra" })[0]).toMatchObject({ value: "current", kind: "forced-only" });
    expect(subtitleChoices(cultures, { subtitleMode: "Default" })[0]?.value).toBe("off");
  });

  it("keeps Original language when the account already shows it", () => {
    expect(audioChoices(cultures, { playDefaultAudioTrack: false, audioLanguage: "OriginalLanguage" }, { originalLanguage: false }).some((c) => c.value === "original")).toBe(true);
  });
});
