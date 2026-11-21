import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { recorded, VERSIONS } from "./device-test-support";

// T2-07 item 7: what the two Jellyfin servers and the pinned Jellyscale answered to the forced request
// (EnableDirectPlay false, AllowVideoStreamCopy false). The files only hold answers; the gateway replay is in
// device-conversion-negotiation.test.ts. The scrub checks of conversion-fixtures.test.ts already read every file in the folders.
const FILES = ["device-conversion-h264", "device-conversion-hevc-hdr10", "device-conversion-multitrack-audio"] as const;

function urlOf(version: string, name: string): URLSearchParams {
  const source = recorded(version, name).MediaSources![0];
  expect(source.TranscodingUrl, `${version}/${name}`).toBeDefined();
  return new URL(source.TranscodingUrl!, "http://placeholder.invalid").searchParams;
}

function param(params: URLSearchParams, name: string): string | undefined {
  for (const [key, value] of params) if (key.toLowerCase() === name.toLowerCase()) return value;
  return undefined;
}

describe.each(VERSIONS)("T2-07 item 7: the device-conversion answers recorded from Jellyfin %s", (version) => {
  it.each(FILES)("%s offers an HLS conversion and no direct play", (name) => {
    const source = recorded(version, name).MediaSources![0];
    expect(source.SupportsDirectPlay).toBe(false);
    expect(source.SupportsTranscoding).toBe(true);
    expect(source.TranscodingSubProtocol?.toLowerCase()).toBe("hls");
    expect(source.TranscodingUrl).toMatch(/master\.m3u8/);
    expect(source.TranscodingUrl).not.toMatch(/\.test|127\.0\.0\.1|ApiKey=(?!REDACTED)/);
  });

  it.each(FILES)("%s turns video stream copy off in the URL", (name) => {
    expect(param(urlOf(version, name), "AllowVideoStreamCopy")?.toLowerCase()).toBe("false");
  });

  it("turns audio stream copy off in the URL of the audio case only", () => {
    expect(param(urlOf(version, "device-conversion-multitrack-audio"), "AllowAudioStreamCopy")?.toLowerCase()).toBe("false");
    expect(param(urlOf(version, "device-conversion-h264"), "AllowAudioStreamCopy")?.toLowerCase()).not.toBe("false");
    expect(param(urlOf(version, "device-conversion-hevc-hdr10"), "AllowAudioStreamCopy")?.toLowerCase()).not.toBe("false");
  });

  it.each(FILES)("%s reports DirectPlayError among its reasons", (name) => {
    expect((param(urlOf(version, name), "TranscodeReasons") ?? "").split(",")).toContain("DirectPlayError");
  });

  it.each(FILES)("%s keeps the scrubbed play session the URL repeats", (name) => {
    const answer = recorded(version, name);
    expect(answer.PlaySessionId).toBe("play-session-1");
    expect(param(urlOf(version, name), "PlaySessionId")).toBe("play-session-1");
  });
});

describe("T2-07 item 7: the files are named so the frozen golden replay does not pick them up", () => {
  it("uses the device-conversion prefix and no conversion- or playbackinfo- name", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const version of VERSIONS) {
      const names = readdirSync(join(here, "../../tests/fixtures/jellyfin", version));
      for (const name of FILES) expect(names).toContain(`${name}.json`);
      expect(names.filter((entry) => /^(conversion|playbackinfo)-.*device/.test(entry))).toEqual([]);
    }
  });

  it("holds the pinned Jellyscale's answer in the pin folder under the same prefix", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sha = /^x-jellyscale-commit:\s*([0-9a-f]{40})\b/m.exec(readFileSync(join(here, "../../../../tests/integration/docker-compose.yml"), "utf8"))?.[1];
    expect(sha).toBeDefined();
    const names = readdirSync(join(here, "../../tests/fixtures/jellyscale", sha!.slice(0, 12)));
    expect(names).toContain("device-conversion-h264.json");
  });
});
