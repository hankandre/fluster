import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { leavePlayer, openPlayer, parsePlayRoute, playRoute } from "./routes";

describe("play route", () => {
  it("round-trips the item, version, and start position", () => {
    const route = { itemId: "a b/c", mediaSourceId: "src 1", startTicks: 420_000_000 };
    expect(playRoute(route)).toBe("#/next/play/a%20b%2Fc?source=src+1&start=420000000");
    expect(parsePlayRoute(playRoute(route))).toEqual(route);
  });

  it("starts from the beginning without a start position or version", () => {
    expect(playRoute({ itemId: "m1", startTicks: 0 })).toBe("#/next/play/m1");
    expect(parsePlayRoute("#/next/play/m1")).toEqual({ itemId: "m1", mediaSourceId: undefined, startTicks: 0 });
  });

  it.each([
    "#/next/play/",
    "#/next/play/?start=5",
    "#/next/play/m1/extra",
    "#/next/play/%E0%A4%A",
    "#/next/play/m1?start=-5",
    "#/next/play/m1?start=abc",
    "#/next/item/m1",
  ])("rejects %s", (hash) => {
    expect(parsePlayRoute(hash)).toBeUndefined();
  });
});

describe("leaving the player", () => {
  it("goes back to the detail entry it was opened from, adding no history", async () => {
    window.location.hash = "#/next/item/m1";
    const length = window.history.length;
    openPlayer({ itemId: "m1", startTicks: 0 });
    expect(window.location.hash).toBe("#/next/play/m1");
    expect(window.history.length).toBe(length + 1);

    leavePlayer("m1");

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(window.history.length).toBe(length + 1);
  });

  it("goes back to Home when opened from Home", async () => {
    window.location.hash = "#/next/home";
    const length = window.history.length;
    openPlayer({ itemId: "m1", startTicks: 600 });
    expect(window.location.hash).toBe("#/next/play/m1?start=600");

    leavePlayer("m1");

    await waitFor(() => expect(window.location.hash).toBe("#/next/home"));
    expect(window.history.length).toBe(length + 1);
  });

  it("replaces the player entry when it was not opened from that detail view", () => {
    window.location.hash = "#/next/play/m2";
    const length = window.history.length;

    leavePlayer("m2");

    expect(window.location.hash).toBe("#/next/item/m2");
    expect(window.history.length).toBe(length);
  });
});
