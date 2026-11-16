import { describe, expect, it } from "vitest";
import type { SubtitleInfo } from "./catalog";
import type { LanguageCulture } from "./languages";
import { subtitleListView } from "./subtitle-list";
import { showAllSubtitlesLabel, subtitleCountLine } from "../features/detail/format";

const cultures: LanguageCulture[] = [
  { displayName: "German", threeLetterName: "deu", threeLetterNames: ["deu", "ger"], twoLetterName: "de" },
  { displayName: "English", threeLetterName: "eng", threeLetterNames: ["eng"], twoLetterName: "en" },
];

function track(language: string | undefined, flags: Partial<SubtitleInfo> = {}): SubtitleInfo {
  return { ...(language === undefined ? {} : { language }), codec: "subrip", isExternal: false, isDefault: false, isForced: false, ...flags };
}

const mixed = [track("eng", { isDefault: true }), track("fra"), track("spa"), track(undefined)];

// 52 tracks in 32 languages: 32 distinct tags, then 20 repeats of them.
function many(withDefault: boolean): SubtitleInfo[] {
  const languages = Array.from({ length: 32 }, (_, i) => (i === 0 ? "eng" : `l${String(i).padStart(2, "0")}`));
  const tracks = languages.map((language) => track(language));
  if (withDefault) tracks[0] = track("eng", { isDefault: true });
  for (let i = 0; i < 20; i += 1) tracks.push(track(languages[i % 32]));
  return tracks;
}

describe("subtitleListView", () => {
  it("none: no tracks", () => {
    expect(subtitleListView([], "eng", cultures)).toEqual({ kind: "none" });
  });

  it("a match", () => {
    const tracks = [track("eng", { isDefault: true }), track("fra"), track("fra", { isForced: true }), track("fra", { title: "French SDH" }), track("spa")];
    const view = subtitleListView(tracks, "fra", cultures);
    expect(view.kind).toBe("preferred");
    if (view.kind !== "preferred") return;
    expect(view.shown.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(view.total).toBe(5);
  });

  it("a short list", () => {
    const view = subtitleListView([track("eng"), track("spa")], "spa", cultures);
    expect(view).toMatchObject({ kind: "preferred", total: 2 });
    if (view.kind === "preferred") expect(view.shown).toHaveLength(1);
  });

  it("no preference", () => {
    const view = subtitleListView(mixed, undefined, cultures);
    expect(view).toMatchObject({ kind: "summary", remaining: 3, remainingLanguages: 2, total: 4 });
    if (view.kind === "summary") expect(view.shown.map((entry) => entry.index)).toEqual([0]);
  });

  it("a preference with no match", () => {
    expect(subtitleListView(mixed, "jpn", cultures)).toEqual(subtitleListView(mixed, undefined, cultures));
  });

  it("no default track", () => {
    const view = subtitleListView(many(false), undefined, cultures);
    expect(view).toMatchObject({ kind: "summary", shown: [], remaining: 52, remainingLanguages: 32, total: 52 });
  });

  it("51 more in 32 languages", () => {
    const view = subtitleListView(many(true), undefined, cultures);
    expect(view).toMatchObject({ kind: "summary", remaining: 51, remainingLanguages: 32 });
    if (view.kind !== "summary") return;
    expect(subtitleCountLine(view.remaining, view.remainingLanguages, view.shown.length > 0)).toBe("51 more in 32 languages");
    expect(subtitleCountLine(52, 32, false)).toBe("52 in 32 languages");
    expect(showAllSubtitlesLabel(view.total)).toBe("Show all 52 subtitles");
  });

  it("one subtitle track", () => {
    expect(subtitleListView([track("eng", { isDefault: true })], undefined, cultures).kind).toBe("all");
    expect(subtitleListView([track("eng")], "eng", cultures).kind).toBe("all");
    expect(subtitleListView([track("fra")], "eng", cultures).kind).toBe("all");
    expect(subtitleListView([track(undefined)], undefined, cultures).kind).toBe("all");
  });

  it("every track in the language is every track", () => {
    expect(subtitleListView([track("eng"), track("eng", { isForced: true })], "eng", cultures).kind).toBe("all");
  });

  it("ger against deu", () => {
    const view = subtitleListView([track("deu"), track("ger"), track("eng")], "ger", cultures);
    expect(view.kind).toBe("preferred");
    if (view.kind === "preferred") expect(view.shown.map((entry) => entry.index)).toEqual([0, 1]);
  });

  it("an untagged track", () => {
    const view = subtitleListView([track("eng", { isDefault: true }), track(undefined), track("und")], undefined, cultures);
    expect(view).toMatchObject({ kind: "summary", remaining: 2, remainingLanguages: 0 });
    for (const preference of ["und", ""]) {
      expect(subtitleListView([track("eng", { isDefault: true }), track(undefined)], preference, cultures).kind).toBe("summary");
    }
  });

  it("counts only listed tracks", () => {
    const view = subtitleListView([track("eng"), track("fra"), track("spa")], undefined, cultures);
    expect(view).toMatchObject({ kind: "summary", total: 3, remaining: 3 });
  });
});

describe("subtitle copy", () => {
  it("writes every form", () => {
    expect(subtitleCountLine(1, 1, true)).toBe("1 more in 1 language");
    expect(subtitleCountLine(1, 1, false)).toBe("1 in 1 language");
    expect(subtitleCountLine(2, 0, true)).toBe("2 more with no language");
    expect(subtitleCountLine(2, 0, false)).toBe("2 with no language");
    expect(subtitleCountLine(5, 3, true)).toBe("5 more in 3 languages");
    expect(showAllSubtitlesLabel(1)).toBe("Show 1 subtitle");
    expect(showAllSubtitlesLabel(2)).toBe("Show all 2 subtitles");
  });
});
