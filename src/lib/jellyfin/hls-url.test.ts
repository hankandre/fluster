import { describe, expect, it } from "vitest";
import { rebuildMasterUrl, type HlsUrlContext } from "./hls-url";

const ITEM = "0123456789abcdef0123456789abcdef";
const context: HlsUrlContext = { serverUrl: "https://media.test", itemId: ITEM, mediaSourceId: ITEM, mediaKind: "videos", playSessionId: "p1" };
const SOURCE = `MediaSourceId=${ITEM}`;

// The 10.11.7 shape: a leading "?&", ApiKey, no EnableTrickplay (P10-02).
const RECORDED = `/videos/${ITEM}/master.m3u8?&DeviceId=fluster&${SOURCE}&VideoCodec=h264,hevc,av1,vp9&AudioCodec=aac&AudioStreamIndex=1&SegmentContainer=mp4&PlaySessionId=p1&ApiKey=secret-key&Tag=t&TranscodeReasons=ContainerBitrateExceedsLimit`;

// A master URL for the item that names the chosen source, plus `query`.
function master(query = "", path = `/videos/${ITEM}/master.m3u8`): string {
  return `${path}?${SOURCE}${query ? `&${query}` : ""}`;
}

function rebuilt(transcodingUrl: string, overrides: Partial<HlsUrlContext> = {}) {
  return rebuildMasterUrl(transcodingUrl, { ...context, ...overrides });
}

function urlOf(transcodingUrl: string, overrides: Partial<HlsUrlContext> = {}): URL {
  const result = rebuilt(transcodingUrl, overrides);
  if (!result.ok) throw new Error(`refused: ${result.detail}`);
  return new URL(result.url);
}

describe("rebuildMasterUrl", () => {
  it("resolves the relative master URL on the server origin and keeps every other parameter", () => {
    const url = urlOf(RECORDED);
    expect(url.origin).toBe("https://media.test");
    expect(url.pathname).toBe(`/videos/${ITEM}/master.m3u8`);
    expect(url.hash).toBe("");
    expect([...url.searchParams.keys()]).toEqual([
      "DeviceId", "MediaSourceId", "VideoCodec", "AudioCodec", "AudioStreamIndex", "SegmentContainer",
      "PlaySessionId", "Tag", "TranscodeReasons", "EnableTrickplay",
    ]);
    expect(url.searchParams.get("VideoCodec")).toBe("h264,hevc,av1,vp9");
    expect(url.searchParams.get("TranscodeReasons")).toBe("ContainerBitrateExceedsLimit");
    expect(url.href).not.toContain("secret-key");
  });

  it("keeps the server base path, as the static stream URL does", () => {
    const url = urlOf(master("ApiKey=k"), { serverUrl: "https://media.test/jellyfin" });
    expect(url.pathname).toBe(`/jellyfin/videos/${ITEM}/master.m3u8`);
    expect(rebuilt(master("", `/jellyfin/videos/${ITEM}/master.m3u8`), { serverUrl: "https://media.test/jellyfin" })).toEqual({ ok: false, detail: "path" });
  });

  it("accepts any case in the fixed path segments, as Rust does", () => {
    expect(urlOf(master("", `/Audio/${ITEM}/Master.M3U8`), { mediaKind: "audio" }).pathname).toBe(`/Audio/${ITEM}/Master.M3U8`);
    expect(rebuilt(master("", `/audio/${ITEM}/master.m3u8`), { mediaKind: "audio" })).toMatchObject({ ok: true, kind: "audio" });
    expect(rebuilt(master("", `/VIDEOS/${ITEM}/master.m3u8`))).toMatchObject({ ok: true, kind: "videos" });
    // Jellyfin writes ids without dashes; a dashed or upper-case id is the same item.
    expect(rebuilt(master("", "/videos/01234567-89AB-CDEF-0123-456789ABCDEF/master.m3u8"))).toMatchObject({ ok: true });
  });

  it("requires the videos path for a video source and the audio path for an audio-only one", () => {
    expect(rebuilt(master("", `/audio/${ITEM}/master.m3u8`))).toEqual({ ok: false, detail: "media type" });
    expect(rebuilt(master(), { mediaKind: "audio" })).toEqual({ ok: false, detail: "media type" });
  });

  it("accepts an absolute master URL on the server origin", () => {
    expect(urlOf(`https://media.test/videos/${ITEM}/master.m3u8?${SOURCE}&ApiKey=k`).searchParams.has("ApiKey")).toBe(false);
  });

  it.each([
    ["another host", `https://evil.test/videos/${ITEM}/master.m3u8`, "other origin"],
    ["another port", `https://media.test:8443/videos/${ITEM}/master.m3u8`, "other origin"],
    ["another scheme on the same host", `http://media.test/videos/${ITEM}/master.m3u8`, "other origin"],
    ["a protocol-relative URL", `//evil.test/videos/${ITEM}/master.m3u8`, "unparsable"],
    ["a backslash path that browsers read as another host", `/\\evil.test/videos/${ITEM}/master.m3u8`, "path"],
    ["user info", `https://user:pass@media.test/videos/${ITEM}/master.m3u8`, "user info"],
    ["a non-HTTP scheme", `file:///videos/${ITEM}/master.m3u8`, "scheme"],
    ["a data URL", "data:application/vnd.apple.mpegurl,#EXTM3U", "scheme"],
    ["an unparsable URL", "videos/x/master.m3u8", "unparsable"],
  ])("refuses %s", (_case, transcodingUrl, detail) => {
    expect(rebuilt(transcodingUrl)).toEqual({ ok: false, detail });
  });

  it.each([
    ["the main playlist", master("", `/videos/${ITEM}/main.m3u8`), "path"],
    ["a segment", master("", `/videos/${ITEM}/hls1/main/0.mp4`), "path"],
    ["the static stream", master("", `/Videos/${ITEM}/stream`), "path"],
    ["the universal audio route", master("", `/Audio/${ITEM}/universal`), "path"],
    ["an extra segment", master("", `/videos/${ITEM}/extra/master.m3u8`), "path"],
    // The URL parser removes dot segments first, so this names another item.
    ["a dot segment that escapes the item", master("", `/videos/${ITEM}/../ffffffffffffffffffffffffffffffff/master.m3u8`), "item"],
    ["a dot segment that leaves the videos path", master("", `/videos/../Items/${ITEM}/master.m3u8`), "path"],
    ["an encoded slash in the id", master("", `/videos/${ITEM}%2Fx/master.m3u8`), "item"],
    ["another item", master("", "/videos/ffffffffffffffffffffffffffffffff/master.m3u8"), "item"],
    ["a wrong media source", `/videos/${ITEM}/master.m3u8?MediaSourceId=ffffffffffffffffffffffffffffffff`, "media source"],
    ["no media source", `/videos/${ITEM}/master.m3u8?DeviceId=d`, "media source"],
    ["the media source twice", master(SOURCE), "media source"],
    ["the media source twice in another case", master(`mediasourceid=${ITEM}`), "media source"],
    ["another play session", master("PlaySessionId=other"), "play session"],
  ])("refuses %s", (_case, transcodingUrl, detail) => {
    expect(rebuilt(transcodingUrl)).toEqual({ ok: false, detail });
  });

  it("accepts the answer's play session and a URL without one", () => {
    expect(urlOf(master("PlaySessionId=p1")).searchParams.get("PlaySessionId")).toBe("p1");
    expect(urlOf(master()).searchParams.has("PlaySessionId")).toBe(false);
  });

  it.each([
    "ApiKey", "apikey", "APIKEY", "api_key", "API_KEY", "access_token", "Access_Token", "Token", "token",
    "X-Emby-Token", "x-emby-token", "ApiToken", "AccessToken", "Api%4Bey", "%61pi_key", "X%2DEmby%2DToken",
  ])("removes the credential parameter %s", (name) => {
    const result = rebuilt(master(`${name}=secret-key&DeviceId=d`));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).not.toContain("secret-key");
    expect([...new URL(result.url).searchParams.keys()]).toEqual(["MediaSourceId", "DeviceId", "EnableTrickplay"]);
  });

  // A parser that trims names differently could read these as a credential.
  it.each(["%20ApiKey", "ApiKey%20", "Api%20Key", "%09api_key", "Token%00", "+ApiKey", "Device%0AId"])(
    "refuses the parameter name %s with whitespace or a control character",
    (name) => {
      expect(rebuilt(master(`${name}=T`))).toEqual({ ok: false, detail: "parameter name" });
    },
  );

  it("removes every repeat of a credential parameter", () => {
    const url = urlOf(master("ApiKey=a&apikey=b&ApiKey=c&api_key=d"));
    expect(url.search).toBe(`?${SOURCE}&EnableTrickplay=false`);
  });

  it.each([
    ["absent", ""],
    ["true", "EnableTrickplay=true"],
    ["repeated in any case", "EnableTrickplay=true&enabletrickplay=1&ENABLETRICKPLAY=false"],
  ])("sets EnableTrickplay=false exactly once when it is %s", (_case, query) => {
    const url = urlOf(master(query));
    const values = [...url.searchParams].filter(([name]) => name.toLowerCase() === "enabletrickplay");
    expect(values).toEqual([["EnableTrickplay", "false"]]);
  });

  it.each(["SubtitleMethod=Hls", "subtitlemethod=hls", "SubtitleMethod=HLS", "Subtitle%4Dethod=Hls", "SubtitleMethod=Hls%20", "SubtitleMethod=%20hls"])(
    "refuses %s",
    (query) => {
      expect(rebuilt(master(query))).toEqual({ ok: false, detail: "HLS subtitles" });
    },
  );

  // SubtitleDeliveryMethod also binds from its numeric value (3 is Hls).
  it.each(["SubtitleMethod=3", "SubtitleMethod=0", "SubtitleMethod=", "SubtitleMethod=Burn"])("refuses the unknown subtitle method %s", (query) => {
    expect(rebuilt(master(query))).toEqual({ ok: false, detail: "subtitle method" });
  });

  it.each(["Encode", "Embed", "External", "Drop", "encode"])("keeps SubtitleMethod=%s", (method) => {
    expect(urlOf(master(`SubtitleMethod=${method}`)).searchParams.get("SubtitleMethod")).toBe(method);
  });

  it("refuses subtitles in the manifest and removes a false value", () => {
    for (const query of ["EnableSubtitlesInManifest=true", "enablesubtitlesinmanifest=True", "EnableSubtitlesInManifest=1"]) {
      expect(rebuilt(master(query))).toEqual({ ok: false, detail: "subtitles in manifest" });
    }
    expect(urlOf(master("EnableSubtitlesInManifest=false")).searchParams.has("EnableSubtitlesInManifest")).toBe(false);
  });

  it("never echoes the original URL in a refusal", () => {
    const result = rebuilt(`https://evil.test/videos/${ITEM}/master.m3u8?ApiKey=secret-key`);
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(JSON.stringify(result)).not.toContain("evil.test");
  });
});
