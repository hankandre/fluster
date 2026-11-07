import { describe, expect, it } from "vitest";
import { parsePlayRoute, playRoute } from "./routes";

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
