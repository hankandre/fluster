// T2-05 acceptance item 2: a launch request is a discriminated union of an original file and an HLS session. It
// carries token-free URLs and the opaque session id, never the header or the token.
import { describe, expect, it } from "vitest";
import type { MediaTrack, PlaybackPlan } from "../domain/playback";
import { LaunchRefusedError, launchRequest } from "./launch-request";

const TITLE = "The Quiet Title Of The Film";
const REFUSED = "Octave will not send this stream address to the player.";

const subtitle: MediaTrack = {
  index: 3,
  type: "Subtitle",
  displayTitle: "English - SRT",
  codec: "srt",
  language: "eng",
  external: true,
  deliveryUrl: "https://media.test/Videos/one/source/Subtitles/3/0/Stream.vtt",
};
const audio: MediaTrack = { index: 1, type: "Audio", displayTitle: "English - AAC - Stereo", codec: "aac", language: "eng", external: false, channels: 2 };

function staticPlan(overrides: Partial<PlaybackPlan> = {}): PlaybackPlan {
  return {
    itemId: "one",
    title: TITLE,
    streamUrl: "https://media.test/Videos/one/stream?Static=true&MediaSourceId=source&PlaySessionId=play-1",
    mediaSourceId: "source",
    playSessionId: "play-1",
    startPositionTicks: 12_345_000_000,
    tracks: [audio, subtitle],
    defaultAudioStreamIndex: 1,
    defaultSubtitleStreamIndex: 3,
    delivery: "static",
    playMethod: "DirectPlay",
    conversionReasons: [],
    ...overrides,
  } as PlaybackPlan;
}

function hlsPlan(overrides: Record<string, unknown> = {}): PlaybackPlan {
  return {
    itemId: "one",
    title: TITLE,
    streamUrl: "https://media.test/jellyfin/videos/one/master.m3u8?MediaSourceId=source&PlaySessionId=play-2",
    mediaSourceId: "source",
    playSessionId: "play-2",
    startPositionTicks: 0,
    tracks: [audio, { ...subtitle, deliveryUrl: "https://media.test/jellyfin/Videos/one/source/Subtitles/3/0/Stream.vtt" }],
    delivery: "hls",
    playMethod: "Transcode",
    conversionReasons: ["AudioCodecNotSupported"],
    serverUrl: "https://media.test/jellyfin",
    mediaKind: "videos",
    ...overrides,
  } as PlaybackPlan;
}

function refusal(plan: PlaybackPlan): unknown {
  try {
    launchRequest(plan, "session-1");
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("launchRequest", () => {
  it("builds an original-file request with exactly the request's fields", () => {
    const request = launchRequest(staticPlan(), "session-1");
    expect(Object.keys(request).sort()).toEqual(
      ["audioStreamIndex", "kind", "sessionId", "startPositionSeconds", "subtitleStreamIndex", "tracks", "url"],
    );
    expect(request).toEqual({
      kind: "original",
      url: staticPlan().streamUrl,
      sessionId: "session-1",
      startPositionSeconds: 1234.5,
      tracks: [audio, subtitle],
      audioStreamIndex: 1,
      subtitleStreamIndex: 3,
    });
  });

  it("omits a default index the plan does not have, never sending it as undefined", () => {
    const plan = staticPlan();
    delete plan.defaultAudioStreamIndex;
    delete plan.defaultSubtitleStreamIndex;
    const request = launchRequest(plan, "session-1");
    expect(Object.keys(request).sort()).toEqual(["kind", "sessionId", "startPositionSeconds", "tracks", "url"]);
    expect("audioStreamIndex" in request).toBe(false);
    expect("subtitleStreamIndex" in request).toBe(false);
  });

  it("builds an HLS request with the master URL, the server URL and the media kind, and no url", () => {
    const plan = hlsPlan();
    const request = launchRequest(plan, "session-1");
    expect(Object.keys(request).sort()).toEqual(["kind", "masterUrl", "mediaKind", "serverUrl", "sessionId", "startPositionSeconds", "tracks"]);
    expect(request).toEqual({
      kind: "hls",
      masterUrl: plan.streamUrl,
      serverUrl: "https://media.test/jellyfin",
      mediaKind: "videos",
      sessionId: "session-1",
      startPositionSeconds: 0,
      tracks: plan.tracks,
    });
    expect("url" in request).toBe(false);
  });

  it("names no item, title, play session, conversion or play method, and no header or token", () => {
    for (const plan of [staticPlan(), hlsPlan()]) {
      const request = launchRequest(plan, "session-1");
      for (const key of ["itemId", "title", "playSessionId", "conversionReasons", "playMethod", "delivery", "mediaSourceId"]) {
        expect(key in request, key).toBe(false);
      }
      const text = JSON.stringify(request);
      for (const leak of [TITLE, "Authorization", "MediaBrowser", "Token="]) expect(text).not.toContain(leak);
    }
  });

  it("copies each track field by field, so an extra field on a track does not cross", () => {
    const smuggled = { ...audio, header: 'MediaBrowser Token="SECRET-TOKEN"' } as MediaTrack;
    const request = launchRequest(staticPlan({ tracks: [smuggled, subtitle] }), "session-1");
    expect(request.tracks[0]).toEqual(audio);
    expect(Object.keys(request.tracks[0]).sort()).toEqual(Object.keys(audio).sort());
    expect(JSON.stringify(request)).not.toContain("SECRET-TOKEN");
  });

  it("keeps a plan-level extra field off the request", () => {
    const smuggled = { ...staticPlan(), authorization: 'MediaBrowser Token="SECRET-TOKEN"' } as unknown as PlaybackPlan;
    const request = launchRequest(smuggled, "session-1");
    expect(JSON.stringify(request)).not.toContain("SECRET-TOKEN");
  });

  const unsafe: [string, PlaybackPlan][] = [
    ["an api_key query", staticPlan({ streamUrl: "https://media.test/Videos/one/stream?Static=true&api_key=SECRET-TOKEN" })],
    ["an ApiKey query", staticPlan({ streamUrl: "https://media.test/Videos/one/stream?ApiKey=SECRET-TOKEN&Static=true" })],
    ["an X-Emby-Token query", staticPlan({ streamUrl: "https://media.test/Videos/one/stream?X-Emby-Token=SECRET-TOKEN" })],
    ["a space-padded token query", staticPlan({ streamUrl: "https://media.test/Videos/one/stream?%20token=SECRET-TOKEN" })],
    ["a user name and password", staticPlan({ streamUrl: "https://u:SECRET-TOKEN@media.test/Videos/one/stream?Static=true" })],
    ["an ftp: URL", staticPlan({ streamUrl: "ftp://media.test/SECRET-TOKEN/stream" })],
    ["a relative URL", staticPlan({ streamUrl: "/videos/x?api_key=SECRET-TOKEN" })],
    ["a string that is not a URL", staticPlan({ streamUrl: "not a url SECRET-TOKEN" })],
    ["an HLS master on another origin", hlsPlan({ streamUrl: "https://other.test/jellyfin/videos/one/master.m3u8?PlaySessionId=SECRET-TOKEN" })],
    ["an HLS master with a credential query", hlsPlan({ streamUrl: "https://media.test/jellyfin/videos/one/master.m3u8?api_key=SECRET-TOKEN" })],
    ["a server URL with a user name and password", hlsPlan({ serverUrl: "https://u:SECRET-TOKEN@media.test/jellyfin" })],
    ["a server URL with a credential query", hlsPlan({ serverUrl: "https://media.test/jellyfin?api_key=SECRET-TOKEN" })],
    ["a server URL that is not http", hlsPlan({ serverUrl: "ftp://media.test/SECRET-TOKEN" })],
    [
      "a subtitle on another origin",
      staticPlan({ tracks: [audio, { ...subtitle, deliveryUrl: "https://other.test/SECRET-TOKEN/Stream.vtt" }] }),
    ],
    [
      "an HLS subtitle on another origin than the server",
      hlsPlan({ tracks: [{ ...subtitle, deliveryUrl: "https://other.test/SECRET-TOKEN/Stream.vtt" }] }),
    ],
    [
      "a subtitle with a credential query",
      staticPlan({ tracks: [audio, { ...subtitle, deliveryUrl: "https://media.test/Videos/one/Stream.vtt?api_key=SECRET-TOKEN" }] }),
    ],
    [
      "a relative subtitle URL",
      staticPlan({ tracks: [audio, { ...subtitle, deliveryUrl: "/Videos/one/SECRET-TOKEN/Stream.vtt" }] }),
    ],
  ];

  it.each(unsafe)("refuses %s without naming any part of the URL", (_name, plan) => {
    const error = refusal(plan);
    expect(error).toBeInstanceOf(LaunchRefusedError);
    expect((error as Error).message).toBe(REFUSED);
    expect("input" in (error as object)).toBe(false);
    const text = `${String(error)} ${JSON.stringify(error)} ${JSON.stringify(Object.entries(error as object))}`;
    for (const part of ["SECRET-TOKEN", "media.test", "other.test", "Videos", "videos", "api_key", "ftp"]) {
      expect(text).not.toContain(part);
    }
  });
});
