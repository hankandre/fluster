import { describe, expect, it } from "vitest";
import type { ItemDetail } from "../../domain/catalog";
import { detailArt } from "./detail-art";

const base: ItemDetail = {
  id: "m1",
  type: "Movie",
  title: "Arrival",
  genres: [],
  cast: [],
  userData: { played: false, favorite: false, resumePositionTicks: 0 },
  versions: [],
};
const poster = { itemId: "m1", type: "Primary" as const, tag: "p", blurHash: "POSTER" };
const backdrop = { itemId: "m1", type: "Backdrop" as const, tag: "b", blurHash: "BACK" };

describe("detailArt", () => {
  it("uses the backdrop and its hash, with no inline poster", () => {
    expect(detailArt({ ...base, poster, backdrop })).toEqual({ ambient: backdrop, tint: "BACK", inlinePoster: false });
  });

  it("shows a movie's poster beside the text when there is no backdrop, and tints from it", () => {
    expect(detailArt({ ...base, poster })).toEqual({ tint: "POSTER", inlinePoster: true });
  });

  it("uses an episode's still as the ambient art", () => {
    expect(detailArt({ ...base, type: "Episode", poster })).toEqual({ ambient: poster, tint: "POSTER", inlinePoster: false });
  });

  it("has no art and no tint without images", () => {
    expect(detailArt(base)).toEqual({ inlinePoster: false });
  });
});
