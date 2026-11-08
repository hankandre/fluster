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

describe("toMediaCard logo and thumb", () => {
  it("maps own Logo and Thumb with their blurhashes", () => {
    const card = toMediaCard({
      Id: "m1",
      Name: "Movie",
      ImageTags: { Logo: "l1", Thumb: "t1" },
      ImageBlurHashes: { Logo: { l1: "HASH-L" }, Thumb: { t1: "HASH-T" } },
    });
    expect(card?.logo).toEqual({ itemId: "m1", type: "Logo", tag: "l1", blurHash: "HASH-L" });
    expect(card?.thumb).toEqual({ itemId: "m1", type: "Thumb", tag: "t1", blurHash: "HASH-T" });
  });

  it("falls back to the parent Logo and Thumb for an episode", () => {
    const card = toMediaCard({
      Id: "e1",
      Name: "Pilot",
      Type: "Episode",
      ParentLogoItemId: "s1",
      ParentLogoImageTag: "pl",
      ParentThumbItemId: "s1",
      ParentThumbImageTag: "pt",
      ImageBlurHashes: { Thumb: { pt: "HASH-PT" } },
    });
    expect(card?.logo).toEqual({ itemId: "s1", type: "Logo", tag: "pl" });
    expect(card?.thumb).toEqual({ itemId: "s1", type: "Thumb", tag: "pt", blurHash: "HASH-PT" });
  });

  it("omits logo and thumb when the item has neither", () => {
    const card = toMediaCard({ Id: "m1", Name: "Movie", ImageTags: { Primary: "p1" } });
    expect(card).not.toHaveProperty("logo");
    expect(card).not.toHaveProperty("thumb");
  });
});
