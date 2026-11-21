import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { toLanguageCultures } from "../jellyfin/account-languages";
import { languageKey } from "./languages";

const root = join(__dirname, "../../tests/fixtures/jellyfin");

describe.each(["10.11.7", "12.4.0"])("languageKey with the Jellyfin %s cultures", (version) => {
  const cultures = toLanguageCultures(JSON.parse(readFileSync(join(root, version, "account-language-cultures.json"), "utf8")));

  it("treats ger, deu, de, and GER as one language", () => {
    const keys = ["ger", "deu", "de", "GER"].map((code) => languageKey(code, cultures));
    expect(new Set(keys)).toEqual(new Set(["deu"]));
  });

  it("treats fre, fra, and fr as one language", () => {
    expect(new Set(["fre", "fra", "fr"].map((code) => languageKey(code, cultures)))).toEqual(new Set(["fra"]));
  });

  it("treats chi and zho as one language", () => {
    expect(languageKey("chi", cultures)).toBe(languageKey("zho", cultures));
  });

  it("keeps an unknown code as itself", () => {
    expect(languageKey("xyz", cultures)).toBe("xyz");
  });

  it("gives no key to und, an empty tag, or none", () => {
    expect(languageKey("und", cultures)).toBeUndefined();
    expect(languageKey("", cultures)).toBeUndefined();
    expect(languageKey(undefined, cultures)).toBeUndefined();
  });
});

describe("languageKey without cultures", () => {
  it("compares by lowercased spelling", () => {
    expect(languageKey("GER", undefined)).toBe("ger");
    expect(languageKey("ger", undefined)).not.toBe(languageKey("deu", undefined));
  });
});
