import { describe, expect, it } from "vitest";
import { evaluateSource, selectSource } from "./source-acceptance";
import type { MediaSourceDto } from "./types";

const playable: MediaSourceDto = {
  Id: "source-1",
  Path: "/media/movie.mkv",
  Protocol: "File",
  VideoType: "VideoFile",
  SupportsDirectPlay: true,
};

describe("evaluateSource", () => {
  it("accepts a direct-play file source", () => {
    expect(evaluateSource(playable)).toMatchObject({ kind: "accepted", source: { Id: "source-1" } });
  });

  it.each([
    [{ SupportsDirectPlay: false }, "no-direct-play"],
    [{ SupportsDirectPlay: undefined }, "no-direct-play"],
    [{ Protocol: "Http" }, "not-a-file"],
    [{ Protocol: undefined }, "not-a-file"],
    [{ TranscodingUrl: "/Videos/x/master.m3u8" }, "server-requires-transcoding"],
    [{ VideoType: "BluRay" }, "disc-source"],
    [{ VideoType: "Dvd" }, "disc-source"],
    [{ VideoType: "Iso" }, "iso-source"],
    [{ VideoType: "bluray" }, "disc-source"],
    [{ VideoType: "DVD" }, "disc-source"],
    [{ VideoType: "ISO" }, "iso-source"],
    [{ VideoType: "VideoFile", Path: "/media/Movie (2024)/BDMV/STREAM/00000.m2ts" }, "disc-source"],
    [{ VideoType: "VideoFile", Path: "/media/Movie (2024)/bdmv" }, "disc-source"],
    [{ VideoType: undefined, Path: "/media/Movie (2024)/VIDEO_TS/VTS_01_1.VOB" }, "disc-source"],
    [{ VideoType: undefined, Path: "D:\\Movies\\Movie\\VIDEO_TS" }, "disc-source"],
    [{ VideoType: "VideoFile", Path: "/media/Movie (2024)/Movie.ISO" }, "iso-source"],
    [{ RequiresOpening: true }, "live-source"],
    [{ Id: undefined }, "missing-source-data"],
    [{ Path: undefined }, "missing-source-data"],
  ] as const)("refuses %o as %s", (change, reason) => {
    expect(evaluateSource({ ...playable, ...change })).toMatchObject({ kind: "refused", reason });
  });

  it("reports a disc source before missing direct-play support", () => {
    const decision = evaluateSource({ ...playable, SupportsDirectPlay: false, Protocol: "Http", VideoType: "BluRay" });
    expect(decision).toMatchObject({ kind: "refused", reason: "disc-source" });
    const iso = evaluateSource({ ...playable, SupportsDirectPlay: false, VideoType: "Iso" });
    expect(iso).toMatchObject({ kind: "refused", reason: "iso-source" });
  });

  it("applies the remaining rules in order", () => {
    const decision = evaluateSource({ ...playable, SupportsDirectPlay: false, Protocol: "Http", TranscodingUrl: "/x" });
    expect(decision).toMatchObject({ kind: "refused", reason: "no-direct-play" });
  });

  it("refuses a disc source even when the server reports direct play", () => {
    expect(evaluateSource({ ...playable, VideoType: "BluRay", Container: "" })).toEqual({
      kind: "refused",
      reason: "disc-source",
      detail: "BluRay",
    });
  });

  it("accepts paths that only mention disc names inside a file or folder name", () => {
    expect(evaluateSource({ ...playable, Path: "/media/BDMV Collection/Movie.mkv" }).kind).toBe("accepted");
    expect(evaluateSource({ ...playable, Path: "/media/Movie.iso.mkv" }).kind).toBe("accepted");
    expect(evaluateSource({ ...playable, RequiresOpening: false }).kind).toBe("accepted");
  });

  it("refuses a live source even when the server reports direct play", () => {
    expect(evaluateSource({ ...playable, RequiresOpening: true })).toEqual({ kind: "refused", reason: "live-source" });
  });
});

describe("selectSource", () => {
  it("refuses an empty or missing source list with no-sources", () => {
    expect(selectSource([])).toMatchObject({ kind: "refused", reason: "no-sources" });
    expect(selectSource(undefined)).toMatchObject({ kind: "refused", reason: "no-sources" });
    expect(selectSource(null)).toMatchObject({ kind: "refused", reason: "no-sources" });
  });

  it("accepts the first acceptable source", () => {
    const decision = selectSource([
      { ...playable, Id: "disc", VideoType: "Dvd" },
      { ...playable, Id: "second" },
      { ...playable, Id: "third" },
    ]);
    expect(decision).toMatchObject({ kind: "accepted", source: { Id: "second" } });
  });

  it("reports the first source's reason when nothing is acceptable", () => {
    const decision = selectSource([
      { ...playable, Id: "disc", VideoType: "Dvd" },
      { ...playable, Id: "iso", VideoType: "Iso" },
    ]);
    expect(decision).toMatchObject({ kind: "refused", reason: "disc-source" });
  });

  it("selects only the requested version", () => {
    const sources = [{ ...playable, Id: "first" }, { ...playable, Id: "second" }];
    expect(selectSource(sources, "second")).toMatchObject({ kind: "accepted", source: { Id: "second" } });
  });

  it("does not fall back to another version when the requested one is refused or missing", () => {
    const sources = [{ ...playable, Id: "first" }, { ...playable, Id: "second", VideoType: "Iso" }];
    expect(selectSource(sources, "second")).toMatchObject({ kind: "refused", reason: "iso-source" });
    expect(selectSource(sources, "third")).toMatchObject({ kind: "refused", reason: "no-sources" });
  });
});
