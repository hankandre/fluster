import { describe, expect, it } from "vitest";
import { selectSource } from "./source-acceptance";
import type { MediaSourceDto, PlaybackInfoResponse } from "./types";

// P17-08 milestone 1: what Jellyfin 10.11.7 and 12.4.0 answer when a first PlaybackInfo names an audio
// index that is not the file's default, on the multi-audio sample, with the Octave conversion profile.
// The recorder is tests/integration/record-fixtures.mjs. These tests assert what the servers answered.
const fixtureFiles = import.meta.glob("../../tests/fixtures/jellyfin/*/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

function fixture<T = PlaybackInfoResponse>(version: string, name: string): T {
  const entry = Object.entries(fixtureFiles).find(([path]) => path.endsWith(`/${version}/${name}.json`));
  if (!entry) throw new Error(`missing fixture ${version}/${name}`);
  return structuredClone(entry[1]) as T;
}

function firstSource(version: string, name: string): MediaSourceDto {
  const source = fixture(version, name).MediaSources?.[0];
  if (!source) throw new Error(`no media source in ${version}/${name}`);
  return source;
}

const context = { serverUrl: "http://127.0.0.1:8096", itemId: "item-multitrack" };

describe.each(["10.11.7", "12.4.0"])("audio pick fixtures on Jellyfin %s", (version) => {
  it("keeps direct play when the index names the second audio track", () => {
    const source = firstSource(version, "conversion-multitrack-audio-pick");
    expect(source.SupportsDirectPlay).toBe(true);
    expect(source.TranscodingUrl).toBeUndefined();
    expect(selectSource([source], context).kind).toBe("direct-play");
    // The server echoes the pick; the design does not rely on it.
    expect(source.DefaultAudioStreamIndex).toBe(2);
  });

  it("carries the pick in a forced conversion's master URL", () => {
    const source = firstSource(version, "conversion-multitrack-audio-pick-force-fallback");
    expect(source.SupportsDirectPlay).toBe(false);
    const url = new URL(source.TranscodingUrl ?? "", "http://jellyfin.test");
    expect(url.pathname).toMatch(/master\.m3u8$/);
    expect(url.searchParams.get("AudioStreamIndex")).toBe("2");
  });

  it("falls back to the file's default for an index that names no stream", () => {
    const source = firstSource(version, "conversion-multitrack-audio-pick-missing");
    expect(source.SupportsDirectPlay).toBe(true);
    expect(source.TranscodingUrl).toBeUndefined();
    expect(source.DefaultAudioStreamIndex).toBe(1);
  });

  it("reports the item detail's default audio index from the account's settings", () => {
    const plain = fixture<{ MediaSources?: MediaSourceDto[] }>(version, "item-detail-no-fields-multitrack");
    const spanish = fixture<{ MediaSources?: MediaSourceDto[] }>(version, "item-detail-no-fields-multitrack-prefer-spanish");
    expect(plain.MediaSources?.[0]?.DefaultAudioStreamIndex).toBe(1);
    expect(spanish.MediaSources?.[0]?.DefaultAudioStreamIndex).toBe(2);
    expect(plain.MediaSources?.[0]?.DefaultAudioStreamIndex).toBe(firstSource(version, "playbackinfo-multitrack-profile").DefaultAudioStreamIndex);
    expect(spanish.MediaSources?.[0]?.DefaultAudioStreamIndex).toBe(firstSource(version, "playbackinfo-multitrack-prefer-spanish").DefaultAudioStreamIndex);
  });
});
