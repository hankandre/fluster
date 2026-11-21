import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Replays the account-language fixtures (P17-01) recorded by
// tests/integration/record-account-language-fixtures.mjs. These tests assert what the two pinned
// servers answered; docs/research/account-languages-api.md states the same facts in the same words.
// Never edit a fixture to fit a test: record it again.
const fixtureRoot = join(__dirname, "../../tests/fixtures/jellyfin");
const versions = ["10.11.7", "12.4.0"] as const;

// The wire fields these tests read. packages/core/src/jellyfin/types.ts gains them with the gateway tasks.
interface WireConfiguration {
  AudioLanguagePreference?: string;
  PlayDefaultAudioTrack: boolean;
  SubtitleLanguagePreference: string;
  SubtitleMode: string;
  DisplayMissingEpisodes: boolean;
  HidePlayedInLatest: boolean;
  RememberAudioSelections: boolean;
  RememberSubtitleSelections: boolean;
  EnableNextEpisodeAutoPlay: boolean;
  [key: string]: unknown;
}
interface WireCulture {
  Name: string;
  DisplayName: string;
  TwoLetterISOLanguageName: string;
  ThreeLetterISOLanguageName: string;
  ThreeLetterISOLanguageNames: string[];
}
interface WireStep {
  step: string;
  request: { method: string; path: string; query: Record<string, string>; body: Record<string, unknown> };
  status: number;
  configuration: WireConfiguration;
}
interface WireCell {
  cell: string;
  saveStatus: number;
  readBack: Record<string, string | boolean>;
  defaultAudioStreamIndex?: number | "absent";
  defaultSubtitleStreamIndex?: number | "absent";
  playbackInfo?: string;
}
interface WireStream {
  Index: number;
  Type: string;
  Language?: string;
  Title?: string;
  IsDefault: boolean;
  IsForced: boolean;
  IsHearingImpaired?: boolean;
}

const fixtureFiles = [
  "users-me-new-user",
  "cultures",
  "configuration-sequence",
  "defaults",
  "playbackinfo-sample",
  "jellyscale-probe",
];

function load<T>(version: string, name: string): T {
  return JSON.parse(readFileSync(join(fixtureRoot, version, `account-language-${name}.json`), "utf8")) as T;
}

// What each server answered for the cultures list (acceptance 1).
const cultureFacts = {
  "10.11.7": { count: 192, withTwoLetter: 192, notThreeLetter: 0 },
  "12.4.0": { count: 494, withTwoLetter: 192, notThreeLetter: 1 },
} as const;

describe.each(versions)("account-language fixtures, Jellyfin %s", (version) => {
  const cell = (id: string): WireCell => {
    const found = load<{ cells: WireCell[] }>(version, "defaults").cells.find((c) => c.cell === id);
    if (!found) throw new Error(`cell ${id} missing`);
    return found;
  };
  const stream = (index: number | "absent" | undefined): WireStream => {
    const streams = load<{ MediaSources: { MediaStreams: WireStream[] }[] }>(version, "playbackinfo-sample").MediaSources[0]!.MediaStreams;
    const found = streams.find((s) => s.Index === index);
    if (!found) throw new Error(`stream ${String(index)} missing`);
    return found;
  };
  const steps = load<{ steps: WireStep[] }>(version, "configuration-sequence").steps;
  const step = (prefix: string): WireStep => {
    const found = steps.find((s) => s.step === prefix);
    if (!found) throw new Error(`step ${prefix} missing`);
    return found;
  };

  it("has every fixture, and each one parses", () => {
    expect(fixtureFiles).toHaveLength(6);
    for (const name of fixtureFiles) {
      expect(existsSync(join(fixtureRoot, version, `account-language-${name}.json`)), `${version}/account-language-${name}.json`).toBe(true);
      expect(() => load(version, name)).not.toThrow();
    }
  });

  describe("scrubbing", () => {
    const files = readdirSync(join(fixtureRoot, version)).filter((f) => f.startsWith("account-language-"));
    const fakeUsers = new Set(["user-languages", "user-test", "user-noconv", "user-discovery"]);
    const fakeServers = new Set(["server-1011", "server-124"]);

    it.each(files)("%s holds no real id, host, token, or user", (file) => {
      const text = readFileSync(join(fixtureRoot, version, file), "utf8");
      expect(text).not.toMatch(/\b[0-9a-f]{32}\b/i);
      expect(text).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
      expect(text).not.toMatch(/127\.0\.0\.1|localhost|:1809[67]\b/);
      expect(text).not.toMatch(/https?:\/\/\d{1,3}(?:\.\d{1,3}){3}\b/);
      for (const match of text.matchAll(/(?:ApiKey|api_key|AccessToken|Token)=([^&"\s]*)/g)) {
        expect(match[1]).toBe("REDACTED");
      }
      for (const match of text.matchAll(/"UserId":\s*"([^"]*)"/g)) expect(fakeUsers.has(match[1] ?? "")).toBe(true);
      for (const match of text.matchAll(/"ServerId":\s*"([^"]*)"/g)) expect(fakeServers.has(match[1] ?? "")).toBe(true);
    });
  });

  describe("a new user's Configuration (GET /Users/Me)", () => {
    const configuration = load<{ Configuration: WireConfiguration }>(version, "users-me-new-user").Configuration;

    it("holds these fields and values, and has no AudioLanguagePreference", () => {
      expect(configuration).toEqual({
        PlayDefaultAudioTrack: true,
        SubtitleLanguagePreference: "",
        DisplayMissingEpisodes: false,
        GroupedFolders: [],
        SubtitleMode: "Default",
        DisplayCollectionsView: false,
        EnableLocalPassword: false,
        OrderedViews: [],
        LatestItemsExcludes: [],
        MyMediaExcludes: [],
        HidePlayedInLatest: true,
        RememberAudioSelections: true,
        RememberSubtitleSelections: true,
        EnableNextEpisodeAutoPlay: true,
        CastReceiverId: "F007D354",
      });
      expect("AudioLanguagePreference" in configuration).toBe(false);
    });
  });

  describe("GET /Localization/Cultures", () => {
    const cultures = load<WireCulture[]>(version, "cultures");
    const facts = cultureFacts[version];

    it(`lists ${facts.count} entries, ${facts.withTwoLetter} with a two-letter name`, () => {
      expect(Array.isArray(cultures)).toBe(true);
      expect(cultures).toHaveLength(facts.count);
      expect(cultures.filter((c) => c.TwoLetterISOLanguageName !== "")).toHaveLength(facts.withTwoLetter);
    });

    it("gives every entry exactly the five recorded keys, and lists its main three-letter name among the names", () => {
      for (const culture of cultures) {
        expect(Object.keys(culture).sort()).toEqual(
          ["DisplayName", "Name", "ThreeLetterISOLanguageName", "ThreeLetterISOLanguageNames", "TwoLetterISOLanguageName"],
        );
        expect(typeof culture.TwoLetterISOLanguageName).toBe("string");
        expect(culture.ThreeLetterISOLanguageNames).toContain(culture.ThreeLetterISOLanguageName);
      }
    });

    it(`has ${facts.notThreeLetter} entries whose three-letter name is not three letters`, () => {
      const odd = cultures.filter((c) => !/^[a-z]{3}$/.test(c.ThreeLetterISOLanguageName));
      expect(odd).toHaveLength(facts.notThreeLetter);
      if (version === "12.4.0") {
        expect(odd).toEqual([
          {
            Name: "Reserved for local use",
            DisplayName: "Reserved for local use",
            TwoLetterISOLanguageName: "",
            ThreeLetterISOLanguageName: "qaa-qtz",
            ThreeLetterISOLanguageNames: ["qaa-qtz"],
          },
        ]);
      }
    });

    it("lists German with deu first and ger second", () => {
      expect(cultures.find((c) => c.TwoLetterISOLanguageName === "de")).toEqual({
        Name: "German",
        DisplayName: "German",
        TwoLetterISOLanguageName: "de",
        ThreeLetterISOLanguageName: "deu",
        ThreeLetterISOLanguageNames: ["deu", "ger"],
      });
    });

    it("lists French with fra first and fre second", () => {
      expect(cultures.find((c) => c.TwoLetterISOLanguageName === "fr")?.ThreeLetterISOLanguageNames).toEqual(["fra", "fre"]);
    });
  });

  describe("POST /Users/Configuration (no userId)", () => {
    const nonLanguage = {
      DisplayMissingEpisodes: true,
      HidePlayedInLatest: false,
      RememberAudioSelections: false,
      RememberSubtitleSelections: false,
      EnableNextEpisodeAutoPlay: false,
      PlayDefaultAudioTrack: false,
      SubtitleMode: "Always",
    };
    const defaults = load<{ Configuration: WireConfiguration }>(version, "users-me-new-user").Configuration;

    it("answers 204 to every step, with no userId query", () => {
      expect(steps.map((s) => s.step)).toEqual([
        "non-language fields changed",
        "whole object, two language fields changed",
        "only the language fields",
        "whole object restored",
        "whole object plus an unknown field",
      ]);
      for (const s of steps) {
        expect(s.status).toBe(204);
        expect(s.request).toMatchObject({ method: "POST", path: "/Users/Configuration", query: {} });
      }
    });

    it("saves the whole object, two language fields changed, and every other field reads back as sent", () => {
      const s = step("whole object, two language fields changed");
      expect(s.configuration).toMatchObject({ ...nonLanguage, AudioLanguagePreference: "deu", SubtitleLanguagePreference: "fra" });
      expect(s.configuration).toEqual(s.request.body);
    });

    it("resets every field a language-only body lacks to the new user's value (it does not merge)", () => {
      const s = step("only the language fields");
      expect(s.request.body).toEqual({ AudioLanguagePreference: "spa", SubtitleLanguagePreference: "ita" });
      expect(s.configuration).toEqual({ ...defaults, AudioLanguagePreference: "spa", SubtitleLanguagePreference: "ita" });
      expect(s.configuration.SubtitleMode).toBe("Default");
      expect(s.configuration.PlayDefaultAudioTrack).toBe(true);
    });

    it("accepts a field it does not know with 204, saves the rest, and drops the unknown field", () => {
      const s = step("whole object plus an unknown field");
      expect(s.request.body.OctaveUnknownField).toBe("fixture");
      expect(s.configuration.SubtitleLanguagePreference).toBe("spa");
      expect("OctaveUnknownField" in s.configuration).toBe(false);
      expect(s.configuration).toEqual({ ...(step("whole object restored").configuration), SubtitleLanguagePreference: "spa" });
    });
  });

  describe("OriginalLanguage", () => {
    it("is accepted as AudioLanguagePreference with 204 and read back unchanged", () => {
      for (const id of ["A6", "A7"]) {
        expect(cell(id).saveStatus).toBe(204);
        expect(cell(id).readBack.AudioLanguagePreference).toBe("OriginalLanguage");
      }
    });

    it("selects the file's default audio track, a:0 English, in both cells, as if no language matched", () => {
      for (const id of ["A6", "A7"]) {
        expect(cell(id).defaultAudioStreamIndex).toBe(1);
        expect(stream(cell(id).defaultAudioStreamIndex)).toMatchObject({ Type: "Audio", Language: "eng", IsDefault: true });
      }
    });
  });

  describe("PlaybackInfo default audio track", () => {
    it("with no language set the new user gets the flagged English track (a:0)", () => {
      expect(cell("A1").readBack.AudioLanguagePreference).toBe("absent");
      expect(stream(cell("A1").defaultAudioStreamIndex)).toMatchObject({ Language: "eng", IsDefault: true });
    });

    it("with PlayDefaultAudioTrack on, the flagged English track wins over a French preference", () => {
      expect(cell("A2").defaultAudioStreamIndex).toBe(1);
      expect(stream(1)).toMatchObject({ Language: "eng", IsDefault: true });
    });

    it("with PlayDefaultAudioTrack off, a French preference selects the French track (a:2)", () => {
      expect(cell("A3").defaultAudioStreamIndex).toBe(3);
      expect(stream(3).Language).toBe("fra");
    });

    it("a preference of ger selects the audio track tagged deu", () => {
      expect(cell("A4").defaultAudioStreamIndex).toBe(2);
      expect(stream(2).Language).toBe("deu");
      expect(cell("A5").defaultAudioStreamIndex).toBe(cell("A4").defaultAudioStreamIndex);
    });
  });

  describe("PlaybackInfo default subtitle track", () => {
    const cases: [string, string, number | "absent"][] = [
      ["S1", "SubtitleMode Default with a French subtitle language selects the flagged English subtitle (s:0)", 5],
      ["S2", "SubtitleMode Always with French selects the first French track, not the forced or SDH one (s:1)", 6],
      ["S3", "SubtitleMode OnlyForced selects the forced French track (s:2)", 7],
      ["S4", "SubtitleMode None selects no subtitle: the key is absent", "absent"],
      ["S5", "SubtitleMode Smart with English audio and French subtitles selects the first French track (s:1)", 6],
      ["S6", "SubtitleMode Smart with French audio and French subtitles selects the forced French track (s:2)", 7],
      ["S7", "SubtitleMode Always with ger selects the first German track, tagged deu (s:4)", 9],
      ["S8", "SubtitleMode Always with deu selects the same track as ger (s:4)", 9],
    ];
    it.each(cases)("%s: %s", (id, _name, index) => {
      expect(cell(id).saveStatus).toBe(204);
      expect(cell(id).defaultSubtitleStreamIndex).toBe(index);
      if (index !== "absent") expect(stream(index).Type).toBe("Subtitle");
    });

    it("tells the forced and the SDH track apart from the plain French one", () => {
      expect(stream(6)).toMatchObject({ Language: "fra", IsForced: false, IsHearingImpaired: false });
      expect(stream(7)).toMatchObject({ Language: "fra", IsForced: true });
      expect(stream(8)).toMatchObject({ Language: "fra", IsHearingImpaired: true });
    });
  });

  describe("the language sample as the server sees it", () => {
    const streams = load<{ MediaSources: { MediaStreams: WireStream[] }[] }>(version, "playbackinfo-sample").MediaSources[0]!.MediaStreams;

    it("lists 1 video, 4 audio, and 12 subtitle streams", () => {
      expect(streams.filter((s) => s.Type === "Video")).toHaveLength(1);
      expect(streams.filter((s) => s.Type === "Audio")).toHaveLength(4);
      expect(streams.filter((s) => s.Type === "Subtitle")).toHaveLength(12);
    });

    it("reports the track tagged ger as deu: the server normalizes the tag, so two deu subtitles remain", () => {
      const german = streams.filter((s) => s.Type === "Subtitle" && s.Title?.startsWith("German"));
      expect(german.map((s) => s.Title)).toEqual(["German (deu)", "German (ger)"]);
      expect(german.map((s) => s.Language)).toEqual(["deu", "deu"]);
    });

    it("has one subtitle without a Language, one forced, one hearing-impaired, and one default", () => {
      const subs = streams.filter((s) => s.Type === "Subtitle");
      expect(subs.filter((s) => s.Language === undefined).map((s) => s.Title)).toEqual(["Untagged"]);
      expect(subs.filter((s) => s.IsForced).map((s) => s.Title)).toEqual(["French forced"]);
      expect(subs.filter((s) => s.IsHearingImpaired).map((s) => s.Title)).toEqual(["French SDH"]);
      expect(subs.filter((s) => s.IsDefault).map((s) => s.Title)).toEqual(["English"]);
    });
  });

  it("GET /jellyscale/v1/track-preferences answers 404", () => {
    expect(load<{ httpStatus: number }>(version, "jellyscale-probe")).toEqual({ httpStatus: 404 });
  });
});
