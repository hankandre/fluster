import { afterEach, describe, expect, it } from "vitest";
import type { ImageRef, MediaCard } from "../domain/catalog";
import { backdropWidth, cardImageFor, heroArtFor, toLibraryCardProps, toMediaCardProps, toMediaRowItems, toPlayCardProps } from "./card-view";

const ref = (itemId: string, type: ImageRef["type"], blurHash?: string): ImageRef => ({ itemId, type, tag: `${type}-tag`, ...(blurHash ? { blurHash } : {}) });
const url = (image: ImageRef, width: number) => `https://x/${image.itemId}/${image.type}/${width}`;

function card(overrides: Partial<MediaCard> = {}): MediaCard {
  return { id: "c1", title: "Card", aspectRatio: 2 / 3, ...overrides };
}

describe("cardImageFor", () => {
  const all = card({ image: ref("c1", "Primary"), thumb: ref("c1", "Thumb"), backdrop: ref("c1", "Backdrop") });

  it("uses Primary for a poster", () => {
    expect(cardImageFor(all, "poster")).toEqual(all.image);
  });

  it("uses Thumb, then Backdrop, then Primary for a thumb", () => {
    expect(cardImageFor(all, "thumb")).toEqual(all.thumb);
    expect(cardImageFor(card({ image: all.image, backdrop: all.backdrop }), "thumb")).toEqual(all.backdrop);
    expect(cardImageFor(card({ image: all.image }), "thumb")).toEqual(all.image);
  });

  it("uses an episode's own Primary, else the series art in thumb order", () => {
    expect(cardImageFor(all, "episode")).toEqual(all.image);
    const seriesPoster = ref("series", "Primary");
    expect(cardImageFor(card({ image: seriesPoster, thumb: all.thumb }), "episode")).toEqual(all.thumb);
    expect(cardImageFor(card({ image: seriesPoster }), "episode")).toEqual(seriesPoster);
  });
});

describe("toMediaCardProps", () => {
  it("builds image widths per variant and maps the marks", () => {
    const source = card({
      kind: "Movie",
      subtitle: "2016",
      image: ref("c1", "Primary", "HASH"),
      thumb: ref("c1", "Thumb"),
      progress: 0.5,
      remainingTicks: 10,
      played: true,
      unplayedCount: 2,
    });
    expect(toMediaCardProps(source, "poster", url)).toEqual({
      variant: "poster",
      title: "Card",
      subtitle: "2016",
      href: "#/next/item/c1",
      image: { src: "https://x/c1/Primary/400", blurHash: "HASH" },
      progress: 0.5,
      remainingTicks: 10,
      played: true,
      unplayedCount: 2,
    });
    expect(toMediaCardProps(source, "thumb", url).image).toEqual({ src: "https://x/c1/Thumb/768" });
  });

  it("links by kind and omits href for an unknown kind", () => {
    expect(toMediaCardProps(card({ kind: "Series" }), "poster", url).href).toBe("#/next/series/c1");
    expect(toMediaCardProps(card({ kind: "BoxSet" }), "poster", url).href).toBe("#/next/collection/c1");
    expect(toMediaCardProps(card(), "poster", url)).not.toHaveProperty("href");
  });

  it("adds ids for row items", () => {
    expect(toMediaRowItems([card()], "poster", url)[0].id).toBe("c1");
  });
});

describe("toLibraryCardProps", () => {
  it("links to the library and uses its image", () => {
    expect(toLibraryCardProps({ id: "lib 1", name: "Movies", collectionType: "movies", image: ref("lib 1", "Primary") }, url)).toEqual({
      variant: "library",
      title: "Movies",
      href: "#/next/browse/lib%201",
      image: { src: "https://x/lib 1/Primary/768" },
    });
  });

  it("has no image without one", () => {
    expect(toLibraryCardProps({ id: "l", name: "Movies", collectionType: "movies" }, url)).not.toHaveProperty("image");
  });
});

describe("toPlayCardProps", () => {
  it("plays from the start without a resume position, and from it with one", () => {
    const plain = toPlayCardProps(card({ kind: "Movie" }), url);
    expect(plain.href).toBe("#/next/play/c1");
    expect(plain.detailsHref).toBe("#/next/item/c1");
    expect(plain.onActivate).toBeTypeOf("function");
    expect(toPlayCardProps(card({ kind: "Episode", resumePositionTicks: 600 }), url).href).toBe("#/next/play/c1?start=600");
  });

  it("points details at the series for a series and passes the describing id", () => {
    const props = toPlayCardProps(card({ kind: "Series" }), url, "hint");
    expect(props.detailsHref).toBe("#/next/series/c1");
    expect(props.describedBy).toBe("hint");
    expect(props.variant).toBe("thumb");
  });

  it("stays a plain article for an unknown kind", () => {
    const props = toPlayCardProps(card(), url, "hint");
    expect(props.href).toBeUndefined();
    expect(props.onActivate).toBeUndefined();
    expect(props.detailsHref).toBeUndefined();
  });
});

describe("heroArtFor", () => {
  it("prefers the backdrop, then the parent backdrop, then the thumb", () => {
    const backdrop = ref("c1", "Backdrop");
    const parentBackdrop = ref("s1", "Backdrop");
    const thumb = ref("c1", "Thumb");
    expect(heroArtFor(card({ backdrop, parentBackdrop, thumb }))).toEqual(backdrop);
    expect(heroArtFor(card({ parentBackdrop, thumb }))).toEqual(parentBackdrop);
    expect(heroArtFor(card({ thumb }))).toEqual(thumb);
    expect(heroArtFor(card())).toBeUndefined();
  });
});

describe("backdropWidth", () => {
  const original = window.innerWidth;
  afterEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
  });

  it("uses 1280 up to a 1280 px window and 1920 above it", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    expect(backdropWidth()).toBe(1280);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1281 });
    expect(backdropWidth()).toBe(1920);
  });
});
