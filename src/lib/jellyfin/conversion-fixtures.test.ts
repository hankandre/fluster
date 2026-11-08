import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The wire fields these tests read. src/lib/jellyfin/types.ts gains them with P10-03.
interface FixtureStream {
  Type?: string;
  DeliveryMethod?: string;
  SupportsExternalStream?: boolean;
}
interface FixtureSource {
  Id?: string;
  VideoType?: string;
  SupportsDirectPlay?: boolean;
  SupportsTranscoding?: boolean;
  TranscodingUrl?: string;
  TranscodingSubProtocol?: string;
  MediaStreams?: FixtureStream[];
}
interface PlaybackInfoResponse {
  ErrorCode?: string;
  MediaSources?: FixtureSource[];
}

// Replays conversion fixtures recorded with the decision 0002 profile and flags
// (docs/decisions/0002-server-transcoding-fallback.md; tests/integration/record-fixtures.mjs).
// These tests assert what the servers answered, so P10-03 can build the decision function on facts.
const fixtureRoot = join(__dirname, "../../../tests/fixtures/jellyfin");
const versions = ["10.11.7", "12.4.0"] as const;

function load(version: string, name: string): PlaybackInfoResponse {
  return JSON.parse(readFileSync(join(fixtureRoot, version, `conversion-${name}.json`), "utf8")) as PlaybackInfoResponse;
}

function first(version: string, name: string) {
  const source = load(version, name).MediaSources?.[0];
  if (!source) throw new Error(`no media source in ${version}/${name}`);
  return source;
}

function transcodeUrl(version: string, name: string): URL {
  const raw = first(version, name).TranscodingUrl;
  if (!raw) throw new Error(`no TranscodingUrl in ${version}/${name}`);
  return new URL(raw, "http://jellyfin.test");
}

function reasons(version: string, name: string): string[] {
  return (transcodeUrl(version, name).searchParams.get("TranscodeReasons") ?? "").split(",").filter(Boolean);
}

function subtitleMethods(version: string, name: string): (string | undefined)[] {
  return (first(version, name).MediaStreams ?? []).filter((s) => s.Type === "Subtitle").map((s) => s.DeliveryMethod);
}

const directPlaySamples = [
  "h264",
  "hevc-hdr10",
  "av1",
  "ass",
  "sidecar",
  "multitrack",
  "versions",
  "dvdsub",
  "iso",
  "episode-s01e01",
  "episode-s01e02",
  "episode-s00e01",
];

describe.each(versions)("conversion fixtures on Jellyfin %s", (version) => {
  it("offers DirectPlay with no TranscodingUrl for every file sample when there is no limit", () => {
    for (const name of directPlaySamples) {
      const sources = load(version, name).MediaSources ?? [];
      expect(sources.length, name).toBeGreaterThanOrEqual(1);
      for (const source of sources) {
        expect(source.SupportsDirectPlay, name).toBe(true);
        expect(source.TranscodingUrl, name).toBeUndefined();
      }
    }
  });

  it("still offers DirectPlay for an ISO image, so Fluster must force the fallback", () => {
    expect(first(version, "iso").VideoType).toBe("Iso");
    expect(first(version, "iso").SupportsDirectPlay).toBe(true);
    const forced = first(version, "iso-force-fallback");
    expect(forced.SupportsDirectPlay).toBe(false);
    expect(forced.TranscodingSubProtocol).toBe("hls");
    expect(reasons(version, "iso-force-fallback")).toContain("DirectPlayError");
  });

  it("answers an HLS conversion for the BluRay folder with and without forced fallback", () => {
    for (const name of ["bluray-folder", "bluray-folder-force-fallback"]) {
      const source = first(version, name);
      expect(source.VideoType, name).toBe("BluRay");
      expect(source.SupportsDirectPlay, name).toBe(false);
      expect(source.TranscodingSubProtocol, name).toBe("hls");
      expect(transcodeUrl(version, name).pathname, name).toBe("/videos/item-bluray/master.m3u8");
      expect(reasons(version, name), name).toEqual([]);
    }
  });

  it("returns an HLS TranscodingUrl with ContainerBitrateExceedsLimit when the limit is below the bitrate", () => {
    const source = first(version, "h264-limited");
    expect(source.SupportsDirectPlay).toBe(false);
    expect(source.TranscodingSubProtocol).toBe("hls");
    expect(reasons(version, "h264-limited")).toContain("ContainerBitrateExceedsLimit");
    expect(transcodeUrl(version, "h264-limited").pathname).toBe("/videos/item-h264/master.m3u8");
  });

  it("keeps parameter names and non-credential values in a scrubbed TranscodingUrl", () => {
    const url = transcodeUrl(version, "h264-limited");
    expect(url.searchParams.get("ApiKey")).toBe("REDACTED");
    expect(url.searchParams.get("PlaySessionId")).toBe("play-session-1");
    expect(url.searchParams.get("VideoCodec")).toBe("h264,hevc,av1,vp9");
    expect(url.searchParams.get("SegmentContainer")).toBe("mp4");
    expect(url.searchParams.has("EnableTrickplay")).toBe(false);
  });

  it("answers no DirectPlay and no conversion for the BluRay folder when the user may not convert", () => {
    const source = first(version, "bluray-folder-no-conversion-user");
    expect(source.SupportsDirectPlay).toBe(false);
    expect(source.SupportsTranscoding).toBe(false);
    expect(source.TranscodingUrl).toBeUndefined();
    expect(load(version, "bluray-folder-no-conversion-user").ErrorCode).toBeUndefined();
  });

  it("lets the restricted user direct play files but not exceed a limit", () => {
    expect(first(version, "h264-no-conversion-user").SupportsDirectPlay).toBe(true);
    const limited = first(version, "h264-limited-no-conversion-user");
    expect(limited.SupportsDirectPlay).toBe(false);
    expect(limited.SupportsTranscoding).toBe(false);
    expect(limited.TranscodingUrl).toBeUndefined();
  });

  it("burns in DVD subtitles while converting and embeds them when direct playing", () => {
    expect(subtitleMethods(version, "dvdsub")).toEqual(["Embed"]);
    expect(subtitleMethods(version, "dvdsub-force-fallback")).toEqual(["Encode"]);
    expect(transcodeUrl(version, "dvdsub-force-fallback").searchParams.get("SubtitleMethod")).toBe("Encode");
  });

  it("offers text subtitles as External while converting", () => {
    expect(subtitleMethods(version, "ass-force-fallback")).toEqual(["External"]);
    expect(subtitleMethods(version, "sidecar-force-fallback")).toEqual(["External"]);
  });
});

describe("version differences", () => {
  it("12.4.0 adds AudioCodecNotSupported for AAC sources that 10.11.7 does not report", () => {
    expect(reasons("10.11.7", "h264-force-fallback")).toEqual(["DirectPlayError"]);
    expect(reasons("12.4.0", "h264-force-fallback")).toEqual(["AudioCodecNotSupported", "DirectPlayError"]);
    expect(reasons("12.4.0", "multitrack-force-fallback")).toEqual(["DirectPlayError"]);
  });

  it("reports SupportsExternalStream differently for the DVD subtitle", () => {
    const external = (version: string) =>
      (first(version, "dvdsub-force-fallback").MediaStreams ?? []).find((s) => s.Type === "Subtitle")?.SupportsExternalStream;
    expect(external("10.11.7")).toBe(false);
    expect(external("12.4.0")).toBe(true);
  });
});

describe("all recorded fixtures are scrubbed", () => {
  const files = versions.flatMap((version) =>
    readdirSync(join(fixtureRoot, version)).map((name) => join(fixtureRoot, version, name)),
  );

  it("replaces every credential value and contains no real host", () => {
    expect(files.length).toBeGreaterThan(30);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(
        /(?:ApiKey|api_key|ApiToken|AccessToken|access_token|X-Emby-Token|Token)(?:=|%3D)([^&"\s%]*)/gi,
      )) {
        expect(match[1], file).toBe("REDACTED");
      }
      for (const match of text.matchAll(/"PlaySessionId":\s*"([^"]*)"|PlaySessionId(?:=|%3D)([^&"\s%]*)/gi)) {
        expect(match[1] ?? match[2], file).toBe("play-session-1");
      }
      expect(text, file).not.toMatch(/Token="/);
      expect(text, file).not.toMatch(/127\.0\.0\.1|localhost/);
      expect(text, file).not.toMatch(/"AccessToken"/);
    }
  });

  it("keeps the conversion fields in every conversion fixture that has a TranscodingUrl", () => {
    let seen = 0;
    for (const version of versions) {
      for (const name of readdirSync(join(fixtureRoot, version)).filter((n) => n.startsWith("conversion-"))) {
        const data = JSON.parse(readFileSync(join(fixtureRoot, version, name), "utf8")) as PlaybackInfoResponse;
        for (const source of data.MediaSources ?? []) {
          if (!source.TranscodingUrl) continue;
          seen += 1;
          expect(source.TranscodingSubProtocol, name).toBe("hls");
          expect(source.TranscodingUrl, name).toContain("ApiKey=REDACTED");
        }
      }
    }
    expect(seen).toBeGreaterThan(10);
  });
});
