import { describe, expect, it } from "vitest";
import { rebuildMasterUrl, type HlsUrlContext } from "./hls-url";

const ITEM = "0123456789abcdef0123456789abcdef";
const context: HlsUrlContext = { serverUrl: "https://media.test", itemId: ITEM, mediaSourceId: ITEM };

// The 10.11.7 shape: a leading "?&", ApiKey, no EnableTrickplay (P10-02).
const RECORDED = `/videos/${ITEM}/master.m3u8?&DeviceId=fluster&MediaSourceId=${ITEM}&VideoCodec=h264,hevc,av1,vp9&AudioCodec=aac&AudioStreamIndex=1&SegmentContainer=mp4&PlaySessionId=p1&ApiKey=secret-key&Tag=t&TranscodeReasons=ContainerBitrateExceedsLimit`;

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
    const url = urlOf(`/videos/${ITEM}/master.m3u8?ApiKey=k`, { serverUrl: "https://media.test/jellyfin" });
    expect(url.pathname).toBe(`/jellyfin/videos/${ITEM}/master.m3u8`);
    expect(rebuilt(`/jellyfin/videos/${ITEM}/master.m3u8`, { serverUrl: "https://media.test/jellyfin" })).toEqual({ ok: false, detail: "path" });
  });

  it("accepts the audio path and any case in the fixed path segments, as Rust does", () => {
    expect(urlOf(`/Audio/${ITEM}/Master.M3U8`).pathname).toBe(`/Audio/${ITEM}/Master.M3U8`);
    expect(rebuilt(`/audio/${ITEM}/master.m3u8`)).toMatchObject({ ok: true, kind: "audio" });
    expect(rebuilt(`/VIDEOS/${ITEM}/master.m3u8`)).toMatchObject({ ok: true, kind: "videos" });
    // Jellyfin writes ids without dashes; a dashed or upper-case id is the same item.
    expect(rebuilt("/videos/01234567-89AB-CDEF-0123-456789ABCDEF/master.m3u8")).toMatchObject({ ok: true });
  });

  it("accepts an absolute master URL on the server origin", () => {
    expect(urlOf(`https://media.test/videos/${ITEM}/master.m3u8?ApiKey=k`).searchParams.has("ApiKey")).toBe(false);
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
    ["the main playlist", `/videos/${ITEM}/main.m3u8`, "path"],
    ["a segment", `/videos/${ITEM}/hls1/main/0.mp4`, "path"],
    ["the static stream", `/Videos/${ITEM}/stream`, "path"],
    ["the universal audio route", `/Audio/${ITEM}/universal`, "path"],
    ["an extra segment", `/videos/${ITEM}/extra/master.m3u8`, "path"],
    // The URL parser removes dot segments first, so this names another item.
    ["a dot segment that escapes the item", `/videos/${ITEM}/../ffffffffffffffffffffffffffffffff/master.m3u8`, "item"],
    ["a dot segment that leaves the videos path", `/videos/../Items/${ITEM}/master.m3u8`, "path"],
    ["an encoded slash in the id", `/videos/${ITEM}%2Fx/master.m3u8`, "item"],
    ["another item", "/videos/ffffffffffffffffffffffffffffffff/master.m3u8", "item"],
    ["a wrong media source", `/videos/${ITEM}/master.m3u8?MediaSourceId=ffffffffffffffffffffffffffffffff`, "media source"],
  ])("refuses %s", (_case, transcodingUrl, detail) => {
    expect(rebuilt(transcodingUrl)).toEqual({ ok: false, detail });
  });

  it.each([
    "ApiKey", "apikey", "APIKEY", "api_key", "API_KEY", "access_token", "Access_Token", "Token", "token",
    "X-Emby-Token", "x-emby-token", "ApiToken", "AccessToken", "Api%4Bey", "%61pi_key", "X%2DEmby%2DToken",
  ])("removes the credential parameter %s", (name) => {
    const result = rebuilt(`/videos/${ITEM}/master.m3u8?${name}=secret-key&DeviceId=d`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).not.toContain("secret-key");
    expect([...new URL(result.url).searchParams.keys()]).toEqual(["DeviceId", "EnableTrickplay"]);
  });

  it("removes every repeat of a credential parameter", () => {
    const url = urlOf(`/videos/${ITEM}/master.m3u8?ApiKey=a&apikey=b&ApiKey=c&api_key=d`);
    expect(url.search).toBe("?EnableTrickplay=false");
  });

  it.each([
    ["absent", ""],
    ["true", "EnableTrickplay=true"],
    ["repeated in any case", "EnableTrickplay=true&enabletrickplay=1&ENABLETRICKPLAY=false"],
  ])("sets EnableTrickplay=false exactly once when it is %s", (_case, query) => {
    const url = urlOf(`/videos/${ITEM}/master.m3u8?${query}`);
    const values = [...url.searchParams].filter(([name]) => name.toLowerCase() === "enabletrickplay");
    expect(values).toEqual([["EnableTrickplay", "false"]]);
  });

  it.each(["SubtitleMethod=Hls", "subtitlemethod=hls", "SubtitleMethod=HLS", "Subtitle%4Dethod=Hls"])("refuses %s", (query) => {
    expect(rebuilt(`/videos/${ITEM}/master.m3u8?${query}`)).toEqual({ ok: false, detail: "HLS subtitles" });
  });

  it("keeps burned-in and external subtitle methods", () => {
    expect(urlOf(`/videos/${ITEM}/master.m3u8?SubtitleMethod=Encode`).searchParams.get("SubtitleMethod")).toBe("Encode");
    expect(urlOf(`/videos/${ITEM}/master.m3u8?SubtitleMethod=External`).searchParams.get("SubtitleMethod")).toBe("External");
  });

  it("refuses subtitles in the manifest and removes a false value", () => {
    for (const query of ["EnableSubtitlesInManifest=true", "enablesubtitlesinmanifest=True", "EnableSubtitlesInManifest=1"]) {
      expect(rebuilt(`/videos/${ITEM}/master.m3u8?${query}`)).toEqual({ ok: false, detail: "subtitles in manifest" });
    }
    expect(urlOf(`/videos/${ITEM}/master.m3u8?EnableSubtitlesInManifest=false`).searchParams.has("EnableSubtitlesInManifest")).toBe(false);
  });

  it("never echoes the original URL in a refusal", () => {
    const result = rebuilt(`https://evil.test/videos/${ITEM}/master.m3u8?ApiKey=secret-key`);
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(JSON.stringify(result)).not.toContain("evil.test");
  });
});
