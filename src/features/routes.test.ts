import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { itemRoute, leavePlayer, leaveToDetails, libraryRoute, openPlayer, parseItemRoute, parseLibraryRoute, parsePlayRoute, playRoute } from "./routes";

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

describe("item route", () => {
  it("reads a plain id, an encoded id, and an id with a query", () => {
    expect(parseItemRoute("#/next/item/m1")).toBe("m1");
    expect(parseItemRoute(itemRoute("m 1/ü"))).toBe("m 1/ü");
    expect(parseItemRoute("#/next/item/m1?x=1")).toBe("m1");
  });

  it.each(["#/next/play/m1", "#/next/item/", "#/next/item/a/b", "#/next/item/%E0%A4%A"])("rejects %s", (hash) => {
    expect(parseItemRoute(hash)).toBeUndefined();
  });
});

describe("leaving to the detail view", () => {
  it("records whether the player was opened from the item's detail view", () => {
    window.location.hash = "#/next/item/m1";
    openPlayer({ itemId: "m1", startTicks: 0 });
    expect(window.history.state).toMatchObject({ playerFromDetail: "m1", playerOpenedFromItem: true });

    window.location.hash = "#/next/home";
    openPlayer({ itemId: "m1", startTicks: 0 });
    expect(window.history.state).toMatchObject({ playerFromDetail: "m1", playerOpenedFromItem: false });
  });

  it("goes back when the detail view opened the player", async () => {
    window.location.hash = "#/next/item/m1";
    const length = window.history.length;
    openPlayer({ itemId: "m1", startTicks: 0 });

    leaveToDetails("m1");

    await waitFor(() => expect(window.location.hash).toBe("#/next/item/m1"));
    expect(window.history.length).toBe(length + 1);
  });

  it("replaces the player entry with the detail view when Home opened it", () => {
    window.location.hash = "#/next/home";
    openPlayer({ itemId: "m1", startTicks: 0 });
    const length = window.history.length;

    leaveToDetails("m1");

    expect(window.location.hash).toBe("#/next/item/m1");
    expect(window.history.length).toBe(length);
  });

  it("compares decoded ids, so an id that needs encoding still goes back", async () => {
    const id = "m 1/ü";
    window.location.hash = itemRoute(id);
    const length = window.history.length;
    openPlayer({ itemId: id, startTicks: 0 });

    leaveToDetails(id);

    await waitFor(() => expect(window.location.hash).toBe(itemRoute(id)));
    expect(window.history.length).toBe(length + 1);
  });
});

describe("library route", () => {
  it("builds the bare route and the sorted route", () => {
    expect(libraryRoute("lib 1")).toBe("#/next/browse/lib%201");
    expect(libraryRoute("lib-1", "added-desc")).toBe("#/next/browse/lib-1?sort=added-desc");
  });

  it("round-trips the id and a known sort", () => {
    expect(parseLibraryRoute(libraryRoute("lib 1", "added-desc"))).toEqual({ libraryId: "lib 1", sort: "added-desc" });
    expect(parseLibraryRoute("#/next/browse/lib-1")).toEqual({ libraryId: "lib-1" });
  });

  it("ignores an unknown sort", () => {
    expect(parseLibraryRoute("#/next/browse/lib-1?sort=bogus")).toEqual({ libraryId: "lib-1" });
  });

  it.each(["#/next/browse", "#/next/browse/", "#/next/browse/?sort=added-desc", "#/next/browse/a/b", "#/next/browse/%E0%A4%A", "#/next/item/m1"])(
    "rejects %s",
    (hash) => expect(parseLibraryRoute(hash)).toBeUndefined(),
  );
});
