import { describe, expect, it } from "vitest";
import { toMediaCard } from "./cards";

describe("toMediaCard images and blurhashes", () => {
  it("looks up the blurhash by image type and tag", () => {
    const card = toMediaCard({
      Id: "m1",
      Name: "Movie",
      ImageTags: { Primary: "p1" },
      ImageBlurHashes: { Primary: { p1: "HASH-P", other: "NOPE" }, Backdrop: { p1: "HASH-B" } },
    });
    expect(card?.image).toEqual({ itemId: "m1", type: "Primary", tag: "p1", blurHash: "HASH-P" });
  });

  it("omits the blurhash when the tag has none", () => {
    const card = toMediaCard({ Id: "m1", Name: "Movie", ImageTags: { Primary: "p1" }, ImageBlurHashes: { Primary: { other: "X" } } });
    expect(card?.image).toEqual({ itemId: "m1", type: "Primary", tag: "p1" });
  });

  it("uses the series poster and its hash for an episode without its own image", () => {
    const card = toMediaCard({
      Id: "e1",
      Name: "Pilot",
      Type: "Episode",
      SeriesId: "s1",
      SeriesPrimaryImageTag: "sp",
      ImageBlurHashes: { Primary: { sp: "HASH-S" } },
    });
    expect(card?.image).toEqual({ itemId: "s1", type: "Primary", tag: "sp", blurHash: "HASH-S" });
  });

  it("falls back to the first backdrop with its hash", () => {
    const card = toMediaCard({ Id: "m1", Name: "Movie", BackdropImageTags: ["b1"], ImageBlurHashes: { Backdrop: { b1: "HASH-B" } } });
    expect(card?.image).toEqual({ itemId: "m1", type: "Backdrop", tag: "b1", blurHash: "HASH-B" });
  });
});
