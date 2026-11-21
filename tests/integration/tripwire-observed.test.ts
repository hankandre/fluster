// T2-09 milestone 1: what the pinned Jellyscale (docker-compose.yml, x-jellyscale-commit) was observed to do, pinned
// where the frozen tests only check structure. The record behind each value is in
// packages/core/tests/fixtures/jellyscale/README.md ("The tripwire against Jellyscale"). A reviewer compares the two.
// Docker-free.
import { describe, expect, it } from "vitest";
import { expectationFor } from "./tripwire-expectations";
import { JELLYSCALE_PLAY_METHOD_CHECK, findJellyscaleItem, listedPaths } from "./tripwire-jellyscale";
import { classifyJellyscaleFfmpeg } from "./tripwire-rules";
import type { ItemDto } from "./tripwire-server";

describe("T2-09 observed Jellyscale rows", () => {
  it("the forced-limit run is a Transcode conversion for ContainerBitrateExceedsLimit: the positive control", () => {
    expect(expectationFor("jellyscale", "full", "h264-limited")).toEqual({
      kind: "conversion",
      methods: ["Transcode"],
      reasonsAnyOf: ["ContainerBitrateExceedsLimit"],
    });
  });

  it("the Blu-ray folder is listed as a plain film under BDMV/STREAM and the core refuses it as disc-source", () => {
    expect(expectationFor("jellyscale", "full", "bluray-folder")).toEqual({ kind: "refused", reason: "disc-source" });
  });

  it("the ISO is not listed, so its row is not-run with the not-listed precondition", () => {
    expect(expectationFor("jellyscale", "full", "iso")).toMatchObject({ kind: "not-run", precondition: "not-listed" });
  });

  it("the sidecar subtitle is fetched with the header and answers 200", () => {
    expect(expectationFor("jellyscale", "full", "sidecar-srt")).toEqual({ kind: "direct-play", externalSubtitle: true });
  });

  it("the gateway cannot match a Jellyscale session to the plan: PlayState has no MediaSourceId", () => {
    expect(JELLYSCALE_PLAY_METHOD_CHECK).toBe("unanswered");
  });
});

describe("T2-09 observed Jellyscale item paths", () => {
  const items: ItemDto[] = [
    { Id: "a", Path: "Synthetic H264 (2024)/Synthetic H264 (2024).mkv" },
    { Id: "b", Path: "Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv" },
    { Id: "c", Path: "Synthetic Versions (2024)/Synthetic Versions (2024) - 720p.mkv" },
    { Id: "d", Path: "Synthetic BluRay (2024)/BDMV/STREAM/00000.m2ts", VideoType: "VideoFile" },
  ];

  it("finds a file by the library-relative Path its absolute path ends with", () => {
    expect(findJellyscaleItem(items, "/media/movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv")?.Id).toBe("a");
    expect(findJellyscaleItem(items, "/media/movies/Synthetic Versions (2024)/Synthetic Versions (2024) - 1080p.mkv")?.Id).toBe("b");
  });

  it("finds the disc folder's file by the folder name, and lists no ISO", () => {
    expect(findJellyscaleItem(items, "/media/movies/Synthetic BluRay (2024)")?.Id).toBe("d");
    expect(findJellyscaleItem(items, "/media/movies/Synthetic ISO (2024)/Synthetic ISO (2024).iso")).toBeUndefined();
    expect(listedPaths(items)).toHaveLength(4);
  });
});

describe("T2-09 observed Jellyscale ffmpeg", () => {
  // Command lines seen in the container with a tight /proc loop in the container during the T2-09 run: the program and its flags.
  const SUBTITLE =
    "ffmpeg -nostdin -v error -i /tmp/subtitles-1930165588/input.srt -map 0:0 /tmp/subtitles-2547773564/0-track.vtt -map 0:0 /tmp/subtitles-2547773564/0-track.srt -map 0:0 /tmp/subtitles-2547773564/0-track.ass";
  const TRANSCODE =
    "ffmpeg -nostdin -v warning -progress pipe:1 -nostats -y -copyts -ss 0.000000 -i /media/movies/Synthetic H264 (2024)/Synthetic H264 (2024).mkv -map 0:v:0 -map 1:1 -vf scale=426:240:flags=bicubic,format=yuv420p -c:v libx264 -preset veryfast -c:a aac -b:a 40000 -f hls -hls_time 4 -hls_segment_filename /tmp/jellyscale-transcode/job-3812703013/%d.m4s /tmp/jellyscale-transcode/job-3812703013/index.m3u8";

  it("the subtitle conversion that a sidecar play starts is other work", () => {
    expect(classifyJellyscaleFfmpeg(SUBTITLE)).toBe("other");
  });

  it("the HLS encode a conversion starts is a transcode", () => {
    expect(classifyJellyscaleFfmpeg(TRANSCODE)).toBe("transcode");
  });

  it("HLS output is a transcode even when it reads a staged subtitle path", () => {
    expect(classifyJellyscaleFfmpeg(`${SUBTITLE} -f hls /tmp/out.m3u8`)).toBe("transcode");
  });

  it("counts a command it has no record of as a transcode", () => {
    expect(classifyJellyscaleFfmpeg("ffmpeg -version")).toBe("transcode");
  });
});
