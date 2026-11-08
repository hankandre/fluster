import { afterEach, describe, expect, it } from "vitest";
import { UnsupportedDeliveryError, type PlaybackPlan } from "../../domain/playback";
import { BROWSER_HLS_UNSUPPORTED_MESSAGE, BrowserPlayerEngine } from "./browser-player";

const plan: PlaybackPlan = {
  itemId: "item-1",
  title: "Movie",
  streamUrl: "https://media.test/videos/item-1/master.m3u8?MediaSourceId=s&EnableTrickplay=false",
  authorization: 'MediaBrowser Client="Fluster", Token="secret"',
  mediaSourceId: "s",
  playSessionId: "p",
  startPositionTicks: 0,
  tracks: [],
  delivery: "hls",
  playMethod: "Transcode",
  conversionReasons: ["ContainerBitrateExceedsLimit"],
};

afterEach(() => document.body.replaceChildren());

describe("BrowserPlayerEngine", () => {
  // Decision 0002: the dev engine does not play HLS and is never a fallback (I7).
  it("refuses an hls plan with a typed error and creates no video element", async () => {
    const host = document.createElement("div");
    host.setAttribute("data-browser-video-host", "");
    document.body.append(host);
    const engine = new BrowserPlayerEngine();
    const events: unknown[] = [];
    await engine.subscribe((event) => events.push(event));

    const error = await engine.launch(plan).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnsupportedDeliveryError);
    expect(error).toMatchObject({ engine: "browser", delivery: "hls", message: BROWSER_HLS_UNSUPPORTED_MESSAGE });
    expect(host.querySelector("video")).toBeNull();
    expect(events).toEqual([]);
  });
});
