import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { languageKey } from "../../domain/languages";
import { CONTROL_REQUEST_TIMEOUT_MS, JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "./types";

interface Call {
  method: "GET" | "POST" | "DELETE";
  url: string;
  data?: unknown;
  config?: HttpRequestConfig;
}

class RecordingTransport implements HttpTransport {
  calls: Call[] = [];
  responses = new Map<string, unknown>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "GET", url, config });
    return { data: this.responses.get(`GET ${url}`) as T, status: 200 };
  }

  // Set to make the next POST of /Users/Configuration fail.
  postError?: unknown;

  async post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "POST", url, data, config });
    if (url === "/Users/Configuration" && this.postError) throw this.postError;
    if (url === "/Users/Configuration") this.responses.set("GET /Users/Me", { Id: "user-1", Configuration: data });
    if (url === "/Users/AuthenticateByName") {
      return { data: { AccessToken: "top-secret", User: { Id: "user-1", Name: "Louise" } } as T, status: 200 };
    }
    return { data: undefined as T, status: 204 };
  }

  async delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "DELETE", url, config });
    return { data: undefined as T, status: 204 };
  }
}

async function signedIn() {
  const transport = new RecordingTransport();
  const gateway = new JellyfinGateway("https://media.test", transport, "install-1");
  await gateway.login("Louise", "password");
  transport.calls = [];
  return { gateway, transport };
}

const root = join(__dirname, "../../../tests/fixtures/jellyfin");
function load<T>(version: string, name: string): T {
  return JSON.parse(readFileSync(join(root, version, `account-language-${name}.json`), "utf8")) as T;
}

describe.each([
  ["10.11.7", 192],
  ["12.4.0", 494],
] as const)("account language gateway calls, Jellyfin %s", (version, cultureCount) => {
  it("reads GET /Users/Me with no params and maps a new user to no preference", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", load(version, "users-me-new-user"));
    const signal = new AbortController().signal;
    await expect(gateway.accountLanguages(signal)).resolves.toEqual({});
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toMatchObject({ method: "GET", url: "/Users/Me", config: { signal, timeout: CONTROL_REQUEST_TIMEOUT_MS } });
    expect(transport.calls[0]?.config?.params).toBeUndefined();
  });

  it("maps the language the server read back after a save", async () => {
    const { gateway, transport } = await signedIn();
    const steps = load<{ steps: { step: string; configuration: Record<string, unknown> }[] }>(version, "configuration-sequence").steps;
    const step = steps.find((candidate) => candidate.step === "whole object, two language fields changed");
    transport.responses.set("GET /Users/Me", { Id: "user-1", Configuration: step?.configuration });
    const audio = step?.configuration.AudioLanguagePreference;
    await expect(gateway.accountLanguages()).resolves.toEqual({
      subtitleLanguage: step?.configuration.SubtitleLanguagePreference,
      ...(typeof audio === "string" && audio !== "" ? { audioLanguage: audio } : {}),
    });
    expect(step?.configuration.SubtitleLanguagePreference).toBe("fra");
  });

  it("reads the audio language preference, and an OriginalLanguage setting as it is", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Configuration: { AudioLanguagePreference: " spa ", SubtitleLanguagePreference: "" } });
    await expect(gateway.accountLanguages()).resolves.toEqual({ audioLanguage: "spa" });
    transport.responses.set("GET /Users/Me", { Configuration: { AudioLanguagePreference: "OriginalLanguage" } });
    await expect(gateway.accountLanguages()).resolves.toEqual({ audioLanguage: "OriginalLanguage" });
  });

  it("reads GET /Localization/Cultures and maps every culture", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Localization/Cultures", load(version, "cultures"));
    const signal = new AbortController().signal;
    const cultures = await gateway.languageCultures(signal);
    expect(cultures).toHaveLength(cultureCount);
    expect(transport.calls[0]).toMatchObject({ method: "GET", url: "/Localization/Cultures", config: { signal, timeout: CONTROL_REQUEST_TIMEOUT_MS } });
    expect(languageKey("ger", cultures)).toBe(languageKey("deu", cultures));
  });
});

describe("account language mapping edge cases", () => {
  it.each([[{ Id: "u" }], [{ Configuration: null }], [{ Configuration: { SubtitleLanguagePreference: "   " } }], [{ Configuration: { SubtitleLanguagePreference: null } }], [null]])(
    "maps %j to no preference",
    async (body) => {
      const { gateway, transport } = await signedIn();
      transport.responses.set("GET /Users/Me", body);
      await expect(gateway.accountLanguages()).resolves.toEqual({});
    },
  );

  it("skips a culture without a main name and tolerates a non-list body", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Localization/Cultures", [{ DisplayName: "Nameless" }, { DisplayName: "German", ThreeLetterISOLanguageName: "DEU", ThreeLetterISOLanguageNames: ["ger"], TwoLetterISOLanguageName: "" }]);
    await expect(gateway.languageCultures()).resolves.toEqual([{ displayName: "German", threeLetterName: "deu", threeLetterNames: ["ger", "deu"] }]);
    transport.responses.set("GET /Localization/Cultures", "oops");
    await expect(gateway.languageCultures()).resolves.toEqual([]);
  });

  it("rejects when the server answers 401", async () => {
    const { gateway, transport } = await signedIn();
    transport.get = async () => { throw Object.assign(new Error("Request failed with status code 401"), { response: { status: 401 } }); };
    await expect(gateway.accountLanguages()).rejects.toThrow();
  });
});

type Json = Record<string, unknown>;

function newUserConfiguration(version: string): Json {
  const me = load<{ Configuration: Json }>(version, "users-me-new-user");
  return { ...me.Configuration, OctaveUnknownField: { nested: [1, "two"] }, HidePlayedInLatest: false };
}

const CHOICES: [string, Json][] = [
  ["audio default", { PlayDefaultAudioTrack: true }],
  ["audio original", { AudioLanguagePreference: "OriginalLanguage", PlayDefaultAudioTrack: false }],
  ["audio language", { AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false }],
  ["audio language again", { AudioLanguagePreference: "deu", PlayDefaultAudioTrack: false }],
  ["subtitle off", { SubtitleMode: "None" }],
  ["subtitle default", { SubtitleMode: "Default" }],
  ["subtitle smart", { SubtitleLanguagePreference: "fra", SubtitleMode: "Smart" }],
  ["subtitle always", { SubtitleLanguagePreference: "fra", SubtitleMode: "Always" }],
];

describe.each(["10.11.7", "12.4.0"] as const)("saving the account languages, Jellyfin %s", (version) => {
  it("reads the settings with the four fields only", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Id: "user-1", Policy: { IsAdministrator: true }, Configuration: newUserConfiguration(version) });
    await expect(gateway.accountLanguageSettings()).resolves.toEqual({ playDefaultAudioTrack: true, subtitleMode: "Default" });
  });

  it.each(CHOICES)("%s: reads fresh, posts the whole object with only its fields changed", async (_name, change) => {
    const { gateway, transport } = await signedIn();
    const read = newUserConfiguration(version);
    transport.responses.set("GET /Users/Me", { Id: "user-1", Policy: { IsAdministrator: true }, Configuration: read });
    const snapshot = structuredClone(read);
    const saved = await gateway.saveAccountLanguages(change);
    expect(transport.calls.map((call) => `${call.method} ${call.url}`)).toEqual(["GET /Users/Me", "POST /Users/Configuration"]);
    for (const call of transport.calls) {
      expect(call.config?.params).toBeUndefined();
      expect(call.config?.timeout).toBe(CONTROL_REQUEST_TIMEOUT_MS);
      expect(call.url).not.toContain("?");
    }
    expect(transport.calls[1]?.data).toStrictEqual({ ...snapshot, ...change });
    expect(Object.keys(saved).every((key) => ["audioLanguage", "playDefaultAudioTrack", "subtitleLanguage", "subtitleMode"].includes(key))).toBe(true);
    expect(JSON.stringify(saved)).not.toContain("IsAdministrator");
    expect(JSON.stringify(saved)).not.toContain("OctaveUnknownField");
  });

  it("leaves AudioLanguagePreference absent when The file's default is saved for a new user", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Id: "user-1", Configuration: newUserConfiguration(version) });
    await gateway.saveAccountLanguages({ PlayDefaultAudioTrack: true });
    expect(transport.calls[1]?.data).not.toHaveProperty("AudioLanguagePreference");
  });

  it("matches the recorded whole-object step on the subtitle fields", async () => {
    const steps = load<{ steps: { step: string; configuration: Json }[] }>(version, "configuration-sequence").steps;
    const step = steps.find((candidate) => candidate.step === "whole object, two language fields changed");
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Id: "user-1", Configuration: newUserConfiguration(version) });
    await gateway.saveAccountLanguages({ SubtitleLanguagePreference: "fra", SubtitleMode: "Always" });
    const body = transport.calls[1]?.data as Json;
    expect(body.SubtitleLanguagePreference).toBe(step?.configuration.SubtitleLanguagePreference);
    expect(body.SubtitleMode).toBe("Always");
  });

  it.each([[{ Id: "u" }], [{ Configuration: null }], [{ Configuration: [] }], [null]])("posts nothing when the read is %j", async (body) => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", body);
    await expect(gateway.saveAccountLanguages({ SubtitleMode: "None" })).rejects.toThrow("no account configuration");
    expect(transport.calls.map((call) => call.method)).toEqual(["GET"]);
  });

  it("a save that races a changed read posts what the server holds now", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Id: "user-1", Configuration: { ...newUserConfiguration(version), SubtitleMode: "Default" } });
    await gateway.accountLanguageSettings();
    // Another app writes after the UI's read.
    transport.responses.set("GET /Users/Me", {
      Id: "user-1",
      Configuration: { ...newUserConfiguration(version), SubtitleMode: "Always", SubtitleLanguagePreference: "spa", RememberAudioSelections: false },
    });
    const saved = await gateway.saveAccountLanguages({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false });
    const body = transport.calls.at(-1)?.data as Json;
    expect(body).toMatchObject({ SubtitleMode: "Always", SubtitleLanguagePreference: "spa", RememberAudioSelections: false, AudioLanguagePreference: "fra" });
    expect(saved).toMatchObject({ subtitleMode: "Always", subtitleLanguage: "spa", audioLanguage: "fra" });
  });

  it("two saves in a row: the second reads after the first posts and keeps its fields", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Id: "user-1", Configuration: newUserConfiguration(version) });
    const first = gateway.saveAccountLanguages({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false });
    const second = gateway.saveAccountLanguages({ SubtitleMode: "None" });
    await Promise.all([first, second]);
    expect(transport.calls.map((call) => `${call.method} ${call.url}`)).toEqual(["GET /Users/Me", "POST /Users/Configuration", "GET /Users/Me", "POST /Users/Configuration"]);
    expect(transport.calls[3]?.data).toMatchObject({ AudioLanguagePreference: "fra", PlayDefaultAudioTrack: false, SubtitleMode: "None" });
  });

  it("a failed save does not block the next one", async () => {
    const { gateway, transport } = await signedIn();
    transport.responses.set("GET /Users/Me", { Id: "user-1", Configuration: newUserConfiguration(version) });
    transport.postError = Object.assign(new Error("Request failed with status code 400"), { response: { status: 400 } });
    await expect(gateway.saveAccountLanguages({ SubtitleMode: "None" })).rejects.toMatchObject({ response: { status: 400 } });
    transport.postError = undefined;
    await expect(gateway.saveAccountLanguages({ SubtitleMode: "Default" })).resolves.toMatchObject({ subtitleMode: "Default" });
  });
});
