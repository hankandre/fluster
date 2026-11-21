import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import { PlaybackRefusedError } from "../domain/playback";
import { webCrypto } from "../adapters/web-crypto";
import { OCTAVE_PROFILE } from "./device-profile";
import { FakeTransport } from "./fake-transport";
import { JellyfinGateway, PLAYBACK_INFO_FLAGS } from "./gateway";

// T2-08 item 4: the contract fixtures recorded from the pinned Jellyscale (tests/integration/record-jellyscale-fixtures.ts),
// replayed through the gateway over a fake transport. They sit in fixtures/jellyscale/<12 hex>/, beside fixtures/jellyfin/.
// This file asserts only what is known before recording. What Jellyscale was observed to answer (stream counts, the sidecar
// DeliveryUrl, differences from Jellyfin) goes in jellyscale-fixtures-observed.test.ts. Never edit a fixture to fit a test.
const fixturesRoot = join(__dirname, "../../tests/fixtures/jellyscale");
const composePath = join(__dirname, "../../../../tests/integration/docker-compose.yml");
const ORIGIN = "http://127.0.0.1:8096";

function pinFolder(): string {
  const sha = /^x-jellyscale-commit:\s*([0-9a-f]{40})\b/m.exec(readFileSync(composePath, "utf8"))?.[1];
  if (!sha) throw new Error("docker-compose.yml has no x-jellyscale-commit of 40 hex characters");
  return sha.slice(0, 12);
}

function folders(): string[] {
  if (!existsSync(fixturesRoot)) return [];
  return readdirSync(fixturesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function files(): string[] {
  return readdirSync(join(fixturesRoot, pinFolder())).filter((name) => name.endsWith(".json")).sort();
}

function load<T = any>(file: string): T {
  return JSON.parse(readFileSync(join(fixturesRoot, pinFolder(), file), "utf8")) as T;
}

const withPrefix = (prefix: string): string[] => files().filter((name) => name.startsWith(prefix));

async function signedIn(responses: Record<string, unknown>) {
  const transport = new FakeTransport();
  transport.responses.set("POST /Users/AuthenticateByName", load("signin-octave-test.json"));
  for (const [key, body] of Object.entries(responses)) transport.responses.set(key, body);
  const gateway = new JellyfinGateway(ORIGIN, webCrypto, transport, "install-1");
  await gateway.login("octave-test", "not-a-real-password");
  return { gateway, transport };
}

describe("T2-08 item 4: Jellyscale contract fixtures", () => {
  it("keeps exactly one pin folder, named for the first 12 hex of x-jellyscale-commit", () => {
    expect(folders()).toEqual([pinFolder()]);
  });

  it("holds at least one fixture of each kind: sign-in, user views, resume, latest, item detail and PlaybackInfo", () => {
    for (const prefix of ["signin-", "userviews", "resume-", "latest-", "item-detail-", "playbackinfo-"]) {
      expect(withPrefix(prefix).length, prefix).toBeGreaterThanOrEqual(1);
    }
  });

  it("parses every fixture as JSON", () => {
    for (const name of files()) expect(() => load(name), name).not.toThrow();
  });

  describe("scrubbing", () => {
    it("holds no token, address, port or real play session in any file of the folder", () => {
      const names = files();
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        const text = readFileSync(join(fixturesRoot, pinFolder(), name), "utf8");
        expect(text, name).not.toMatch(/127\.0\.0\.1|localhost|:18098\b/);
        for (const match of text.matchAll(/(?:ApiKey|api_key|ApiToken|AccessToken|access_token|X-Emby-Token|Token)=([^&"\s]*)/gi)) {
          expect(match[1], name).toBe("REDACTED");
        }
        for (const match of text.matchAll(/"AccessToken":\s*"([^"]*)"/g)) expect(match[1], name).toBe("REDACTED");
        for (const match of text.matchAll(/"PlaySessionId":\s*"([^"]*)"/g)) expect(match[1], name).toBe("play-session-1");
        for (const match of text.matchAll(/PlaySessionId=([^&"\s]*)/g)) expect(match[1], name).toBe("play-session-1");
      }
    });
  });

  describe("sign-in", () => {
    it("names the user and holds a redacted token", () => {
      for (const name of withPrefix("signin-")) {
        const body = load(name);
        expect(typeof body.User?.Id, name).toBe("string");
        expect(typeof body.User?.Name, name).toBe("string");
        expect(body.AccessToken, name).toBe("REDACTED");
      }
    });

    it("signs the gateway in through the transport", async () => {
      const { gateway, transport } = await signedIn({});
      expect(transport.signIns).toHaveLength(1);
      expect(gateway.serverUrl).toBe(ORIGIN);
    });
  });

  describe("user views", () => {
    it("replays through userViews() as a non-empty list of libraries", async () => {
      for (const name of withPrefix("userviews")) {
        const { gateway } = await signedIn({ "GET /UserViews": load(name) });
        const views = await gateway.userViews();
        expect(Array.isArray(views), name).toBe(true);
        expect(views.length, name).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("resume", () => {
    it("replays through resumeItems() as a list of cards", async () => {
      for (const name of withPrefix("resume-")) {
        const { gateway } = await signedIn({ "GET /UserItems/Resume": load(name) });
        const cards = await gateway.resumeItems();
        expect(Array.isArray(cards), name).toBe(true);
        expect(cards.length, name).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("latest", () => {
    it("is a bare array, as Jellyfin answers, and maps to cards through latestInLibrary()", async () => {
      for (const name of withPrefix("latest-")) {
        const body = load(name);
        expect(Array.isArray(body), name).toBe(true);
        const { gateway } = await signedIn({ "GET /Items/Latest": body });
        const cards = await gateway.latestInLibrary("view-1");
        expect(Array.isArray(cards), name).toBe(true);
        expect(cards.length, name).toBe(body.length);
      }
    });
  });

  describe("item detail", () => {
    it("replays through itemDetail() for the item it was recorded for", async () => {
      for (const name of withPrefix("item-detail-")) {
        const body = load(name);
        expect(typeof body.Id, name).toBe("string");
        const { gateway } = await signedIn({ [`GET /Items/${encodeURIComponent(body.Id)}`]: body });
        const detail = await gateway.itemDetail(body.Id);
        expect(detail.id, name).toBe(body.Id);
        expect(detail.title, name).toBe(body.Name);
      }
    });
  });

  describe("PlaybackInfo", () => {
    const item: LibraryItem = { id: "item-fixture", name: "Fixture", type: "Movie", resumePositionTicks: 0, played: false };

    async function negotiate(name: string) {
      const { gateway, transport } = await signedIn({ [`POST /Items/${item.id}/PlaybackInfo`]: load(name) });
      const outcome = await gateway.createPlaybackPlan(item).then(
        (plan) => ({ plan }),
        (error: unknown) => ({ error }),
      );
      return { transport, ...outcome };
    }

    it("replays every PlaybackInfo fixture to a plan or a typed refusal, never another error", async () => {
      const names = withPrefix("playbackinfo-");
      expect(names.length).toBeGreaterThanOrEqual(1);
      for (const name of names) {
        const result = await negotiate(name);
        if ("error" in result) expect(result.error, name).toBeInstanceOf(PlaybackRefusedError);
        else expect(typeof result.plan.streamUrl, name).toBe("string");
      }
    });

    it("never puts a credential in a stream URL or a subtitle URL it builds", async () => {
      for (const name of withPrefix("playbackinfo-")) {
        const result = await negotiate(name);
        if (!("plan" in result)) continue;
        const urls = [result.plan.streamUrl, ...result.plan.tracks.map((track) => track.deliveryUrl).filter((url): url is string => Boolean(url))];
        for (const url of urls) {
          expect(url, name).not.toMatch(/api_?key|token/i);
          const parsed = new URL(url);
          expect(parsed.origin, name).toBe(ORIGIN);
          expect(parsed.username + parsed.password, name).toBe("");
        }
      }
    });

    it("sends the same flags in the body and the query, with the Octave profile", async () => {
      for (const name of withPrefix("playbackinfo-")) {
        const { transport } = await negotiate(name);
        const [request] = transport.requests.filter((entry) => entry.url.endsWith("/PlaybackInfo"));
        expect(request, name).toBeDefined();
        const body = request.data as Record<string, unknown>;
        for (const [key, value] of Object.entries(PLAYBACK_INFO_FLAGS)) {
          expect(body[key], `${name} body ${key}`).toBe(value);
          expect(request.params[key], `${name} query ${key}`).toBe(String(value));
        }
        expect(body.DeviceProfile, name).toEqual(OCTAVE_PROFILE);
      }
    });

    it("plays the H.264 sample as a direct play from a URL the core built, with no credential", async () => {
      const names = withPrefix("playbackinfo-h264");
      expect(names.length).toBeGreaterThanOrEqual(1);
      for (const name of names) {
        const result = await negotiate(name);
        if (!("plan" in result)) throw new Error(`${name}: expected a plan, got ${String((result as { error: unknown }).error)}`);
        expect(result.plan.delivery, name).toBe("static");
        expect(result.plan.playMethod, name).toBe("DirectPlay");
        expect(result.plan.conversionReasons, name).toEqual([]);
        const url = new URL(result.plan.streamUrl);
        expect(url.origin, name).toBe(ORIGIN);
        expect(url.pathname, name).toBe(`/Videos/${item.id}/stream`);
        expect(url.searchParams.get("Static"), name).toBe("true");
        expect(result.plan.streamUrl, name).not.toMatch(/api_?key|token/i);
      }
    });
  });
});
