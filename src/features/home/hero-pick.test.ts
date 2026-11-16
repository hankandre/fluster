import { describe, expect, it } from "vitest";
import type { MediaCard } from "../../domain/catalog";
import { pickHero, type CandidateSource, type Source } from "./hero-pick";

function card(id: string, kind?: MediaCard["kind"]): MediaCard {
  return { id, title: id, aspectRatio: 1, ...(kind ? { kind } : {}) };
}
const ok = (...cards: MediaCard[]): Source<MediaCard[]> => ({ status: "success", data: cards });
const pending: Source<MediaCard[]> = { status: "pending" };
const failed: Source<MediaCard[]> = { status: "error" };
const views: Source<unknown[]> = { status: "success", data: [{}] };
const idle: CandidateSource = { status: "idle" };
const none = new Set<string>();

function pick(row: Source<MediaCard[]>, latest: Source<MediaCard[]>[], extra: Partial<Parameters<typeof pickHero>[0]> = {}) {
  return pickHero({ row, agedOutIds: none, sequel: idle, similar: idle, views, latest, ...extra });
}

describe("pickHero", () => {
  it("picks the first Continue watching card", () => {
    expect(pick(ok(card("r", "Movie"), card("n", "Episode")), [ok(card("l", "Movie"))])).toEqual({ status: "ready", card: card("r", "Movie") });
  });

  it("falls to the first non-empty Latest row", () => {
    expect(pick(ok(), [ok(), ok(card("l2", "Series")), ok(card("l3", "Movie"))])).toEqual({ status: "ready", card: card("l2", "Series") });
  });

  it("waits while an earlier source is pending, even if a later one resolved", () => {
    expect(pick(pending, [ok(card("l", "Movie"))])).toEqual({ status: "pending" });
    expect(pick(ok(), [ok(card("l", "Movie"))], { sequel: { status: "pending" } })).toEqual({ status: "pending" });
    expect(pick(ok(), [ok(card("l", "Movie"))], { similar: { status: "pending" } })).toEqual({ status: "pending" });
    expect(pick(ok(), [], { views: { status: "pending" } })).toEqual({ status: "pending" });
    expect(pick(ok(), [pending, ok(card("l", "Movie"))])).toEqual({ status: "pending" });
  });

  it("does not wait for a later Latest row once an earlier one has a card", () => {
    expect(pick(ok(), [ok(card("l", "Movie")), pending])).toEqual({ status: "ready", card: card("l", "Movie") });
  });

  it("skips ineligible kinds", () => {
    expect(pick(ok(card("b", "BoxSet"), card("u")), [ok(card("x", "Other"), card("m", "Movie"))])).toEqual({ status: "ready", card: card("m", "Movie") });
  });

  it("moves on from an errored row or Latest source", () => {
    expect(pick(failed, [ok(card("l", "Movie"))])).toEqual({ status: "ready", card: card("l", "Movie") });
    expect(pick(failed, [failed, ok(card("l", "Movie"))])).toEqual({ status: "ready", card: card("l", "Movie") });
  });

  it("returns none when the libraries failed or nothing matched", () => {
    expect(pick(ok(), [], { views: { status: "error" } })).toEqual({ status: "none" });
    expect(pick(ok(), [ok(), failed])).toEqual({ status: "none" });
    expect(pick(ok(), [], { views: { status: "success", data: [] } })).toEqual({ status: "none" });
  });

  it("prefers a sequel, then a similar title, over the newest addition when the row is empty", () => {
    const latest = [ok(card("l", "Movie"))];
    expect(pick(ok(), latest, { sequel: { status: "success", card: card("seq", "Movie") }, similar: { status: "success", card: card("sim", "Movie") } }))
      .toEqual({ status: "ready", card: card("seq", "Movie") });
    expect(pick(ok(), latest, { sequel: { status: "success" }, similar: { status: "success", card: card("sim", "Movie") } }))
      .toEqual({ status: "ready", card: card("sim", "Movie") });
    expect(pick(ok(), latest, { sequel: { status: "error" }, similar: { status: "error" } })).toEqual({ status: "ready", card: card("l", "Movie") });
  });

  it("does not wait for Similar once a sequel is found", () => {
    expect(pick(ok(), [], { sequel: { status: "success", card: card("seq", "Movie") }, similar: { status: "pending" } }))
      .toEqual({ status: "ready", card: card("seq", "Movie") });
  });

  it("never picks an aged-out film or series from Latest", () => {
    const aged = new Set(["old", "series-1"]);
    expect(pick(ok(), [ok(card("old", "Movie"), card("series-1", "Series"), card("fresh", "Movie"))], { agedOutIds: aged }))
      .toEqual({ status: "ready", card: card("fresh", "Movie") });
  });
});
