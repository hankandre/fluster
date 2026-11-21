import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "../domain/catalog";
import { webCrypto } from "../adapters/web-crypto";
import { FakeTransport } from "./fake-transport";
import { JellyfinGateway } from "./gateway";

// T2-08 item 4, the part that is known only after recording: what the pinned Jellyscale was observed to answer
// (2026-11-21). The frozen jellyscale-fixtures.test.ts holds what was known before. If a re-recording changes one
// of these, the difference is the finding; read it, do not edit the fixture to fit.
const folder = readFileSync(join(__dirname, "../../../../tests/integration/docker-compose.yml"), "utf8").match(/^x-jellyscale-commit:\s*([0-9a-f]{12})/m)?.[1];
const dir = join(__dirname, "../../tests/fixtures/jellyscale", folder ?? "missing");
const load = (file: string): any => JSON.parse(readFileSync(join(dir, file), "utf8"));
const ORIGIN = "http://127.0.0.1:8096";

async function signedIn(responses: Record<string, unknown>) {
  const transport = new FakeTransport();
  transport.responses.set("POST /Users/AuthenticateByName", load("signin-octave-test.json"));
  for (const [key, body] of Object.entries(responses)) transport.responses.set(key, body);
  const gateway = new JellyfinGateway(ORIGIN, webCrypto, transport, "install-1");
  await gateway.login("octave-test", "not-a-real-password");
  return { gateway, transport };
}

describe("T2-08 item 4: what the pinned Jellyscale answered", () => {
  it("lists the Movies and Shows libraries", async () => {
    const { gateway } = await signedIn({ "GET /UserViews": load("userviews.json") });
    const views = await gateway.userViews();
    expect(views.map((view) => view.name)).toEqual(["Movies", "Shows"]);
  });

  it("lists the H.264 film with its saved position in resume", async () => {
    const { gateway } = await signedIn({ "GET /UserItems/Resume": load("resume-in-progress.json") });
    const cards = await gateway.resumeItems();
    expect(cards.map((card) => card.title)).toEqual(["Synthetic H264"]);
    expect(cards[0].resumePositionTicks ?? 0).toBeGreaterThan(0);
  });

  it("answers latest as a bare array: 11 films in Movies and 3 episodes in Shows, ungrouped (Jellyscale #234)", () => {
    expect(load("latest-movies.json")).toHaveLength(11);
    expect(load("latest-shows.json")).toHaveLength(3);
  });

  it("maps the Multitrack film to one video and two audio streams", async () => {
    const body = load("item-detail-multitrack.json");
    const streams = body.MediaStreams as { Type: string; Language: string | null }[];
    expect(streams.filter((stream) => stream.Type === "Audio").map((stream) => stream.Language)).toEqual(["eng", "spa"]);
    const { gateway } = await signedIn({ [`GET /Items/${body.Id}`]: body });
    const detail = await gateway.itemDetail(body.Id);
    expect(detail.title).toBe("Synthetic Multitrack");
  });

  it("offers every sample's PlaybackInfo as a direct play of the original", () => {
    for (const file of ["playbackinfo-h264-profile.json", "playbackinfo-multitrack-profile.json", "playbackinfo-sidecar-profile.json"]) {
      const source = load(file).MediaSources[0];
      expect(source.SupportsDirectPlay, file).toBe(true);
      expect(source.TranscodingUrl ?? null, file).toBeNull();
    }
  });

  it("carries the sidecar's DeliveryUrl with an ApiKey that the recorder scrubbed, and the core rebuilds it without one", async () => {
    const body = load("playbackinfo-sidecar-profile.json");
    const external = (body.MediaSources[0].MediaStreams as { IsExternal?: boolean; DeliveryUrl?: string }[]).find((stream) => stream.IsExternal);
    expect(external?.DeliveryUrl).toMatch(/\?ApiKey=REDACTED$/);
    const item: LibraryItem = { id: "item-sidecar", name: "Synthetic Sidecar", type: "Movie", resumePositionTicks: 0, played: false };
    const { gateway } = await signedIn({ [`POST /Items/${item.id}/PlaybackInfo`]: body });
    const plan = await gateway.createPlaybackPlan(item);
    const urls = plan.tracks.map((track) => track.deliveryUrl).filter((url): url is string => Boolean(url));
    expect(urls.length).toBeGreaterThanOrEqual(1);
    for (const url of urls) expect(url).not.toMatch(/ApiKey|REDACTED/i);
  });
});
