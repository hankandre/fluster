import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { languageKey } from "../../domain/languages";
import { CONTROL_REQUEST_TIMEOUT_MS, JellyfinGateway } from "./gateway";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "./types";

interface Call {
  method: "GET" | "POST" | "DELETE";
  url: string;
  config?: HttpRequestConfig;
}

class RecordingTransport implements HttpTransport {
  calls: Call[] = [];
  responses = new Map<string, unknown>();

  async get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "GET", url, config });
    return { data: this.responses.get(`GET ${url}`) as T, status: 200 };
  }

  async post<T>(url: string, _data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.calls.push({ method: "POST", url, config });
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
    await expect(gateway.accountLanguages()).resolves.toEqual({ subtitleLanguage: step?.configuration.SubtitleLanguagePreference });
    expect(step?.configuration.SubtitleLanguagePreference).toBe("fra");
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
