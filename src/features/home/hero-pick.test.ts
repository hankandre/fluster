import { describe, expect, it } from "vitest";
import type { MediaCard } from "../../domain/catalog";
import { pickHero, type Source } from "./hero-pick";

function card(id: string, kind?: MediaCard["kind"]): MediaCard {
  return { id, title: id, aspectRatio: 1, ...(kind ? { kind } : {}) };
}
const ok = (...cards: MediaCard[]): Source<MediaCard[]> => ({ status: "success", data: cards });
const pending: Source<MediaCard[]> = { status: "pending" };
const failed: Source<MediaCard[]> = { status: "error" };
const views: Source<unknown[]> = { status: "success", data: [{}] };

describe("pickHero", () => {
  it("picks the first Continue watching item", () => {
    expect(pickHero(ok(card("r", "Movie")), ok(card("n", "Episode")), views, [ok(card("l", "Movie"))]))
      .toEqual({ status: "ready", card: card("r", "Movie") });
  });

  it("falls to Next up, then the first non-empty Latest row", () => {
    expect(pickHero(ok(), ok(card("n", "Episode")), views, [ok(card("l", "Movie"))]))
      .toEqual({ status: "ready", card: card("n", "Episode") });
    expect(pickHero(ok(), ok(), views, [ok(), ok(card("l2", "Series")), ok(card("l3", "Movie"))]))
      .toEqual({ status: "ready", card: card("l2", "Series") });
  });

  it("waits while an earlier source is pending, even if a later one resolved", () => {
    expect(pickHero(pending, ok(card("n", "Episode")), views, [])).toEqual({ status: "pending" });
    expect(pickHero(ok(), pending, views, [ok(card("l", "Movie"))])).toEqual({ status: "pending" });
    expect(pickHero(ok(), ok(), { status: "pending" }, [])).toEqual({ status: "pending" });
    expect(pickHero(ok(), ok(), views, [pending, ok(card("l", "Movie"))])).toEqual({ status: "pending" });
  });

  it("skips ineligible kinds", () => {
    expect(pickHero(ok(card("b", "BoxSet"), card("u")), ok(card("s", "Series")), views, [ok(card("x", "Other"), card("m", "Movie"))]))
      .toEqual({ status: "ready", card: card("m", "Movie") });
  });

  it("moves on from an errored source", () => {
    expect(pickHero(failed, ok(card("n", "Episode")), views, [])).toEqual({ status: "ready", card: card("n", "Episode") });
    expect(pickHero(failed, failed, views, [failed, ok(card("l", "Movie"))])).toEqual({ status: "ready", card: card("l", "Movie") });
  });

  it("returns none when the libraries failed or nothing matched", () => {
    expect(pickHero(ok(), ok(), { status: "error" }, [])).toEqual({ status: "none" });
    expect(pickHero(ok(), ok(), views, [ok(), failed])).toEqual({ status: "none" });
    expect(pickHero(ok(), ok(), { status: "success", data: [] }, [])).toEqual({ status: "none" });
  });
});
