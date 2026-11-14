import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { collectionRoute, itemRoute, leavePlayer, leaveToDetails, libraryRoute, openPlayer, parseCollectionRoute, parseItemRoute, parseLibraryRoute, parsePlayRoute, playRoute, replaceRoute, ROUTE_REPLACED_EVENT } from "./routes";

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
    expect(parseLibraryRoute(libraryRoute("lib 1", "added-desc"))).toEqual({ libraryId: "lib 1", sort: "added-desc", filters: [] });
    expect(parseLibraryRoute("#/next/browse/lib-1")).toEqual({ libraryId: "lib-1", filters: [] });
  });

  it("ignores an unknown sort", () => {
    expect(parseLibraryRoute("#/next/browse/lib-1?sort=bogus")).toEqual({ libraryId: "lib-1", filters: [] });
  });

  it("writes the sort and filters in canonical order and leaves the defaults out", () => {
    expect(libraryRoute("lib-1", "name-asc")).toBe("#/next/browse/lib-1");
    expect(libraryRoute("lib-1", "added-desc", ["IsUnplayed"])).toBe("#/next/browse/lib-1?sort=added-desc&filters=IsUnplayed");
    expect(libraryRoute("lib-1", "name-desc", ["IsResumable", "IsUnplayed"])).toBe("#/next/browse/lib-1?sort=name-desc&filters=IsUnplayed,IsResumable");
    expect(libraryRoute("lib-1", undefined, ["IsFavorite"])).toBe("#/next/browse/lib-1?filters=IsFavorite");
  });

  it("round-trips sort and filters and drops unknown or repeated filters", () => {
    expect(parseLibraryRoute(libraryRoute("lib-1", "rating-desc", ["IsFavorite", "IsUnplayed"]))).toEqual({
      libraryId: "lib-1", sort: "rating-desc", filters: ["IsUnplayed", "IsFavorite"],
    });
    expect(parseLibraryRoute("#/next/browse/lib-1?filters=Bogus,IsResumable,IsResumable")).toEqual({ libraryId: "lib-1", filters: ["IsResumable"] });
    expect(parseLibraryRoute("#/next/browse/lib-1?filters=IsUnplayed%2CIsFavorite")?.filters).toEqual(["IsUnplayed", "IsFavorite"]);
  });

  it.each(["#/next/browse", "#/next/browse/", "#/next/browse/?sort=added-desc", "#/next/browse/a/b", "#/next/browse/%E0%A4%A", "#/next/item/m1"])(
    "rejects %s",
    (hash) => expect(parseLibraryRoute(hash)).toBeUndefined(),
  );
});

describe("collection route", () => {
  it("builds and parses with sort and filters", () => {
    expect(collectionRoute("box 1")).toBe("#/next/collection/box%201");
    const hash = collectionRoute("box-1", "name-desc", ["IsUnplayed"]);
    expect(hash).toBe("#/next/collection/box-1?sort=name-desc&filters=IsUnplayed");
    expect(parseCollectionRoute(hash)).toEqual({ collectionId: "box-1", sort: "name-desc", filters: ["IsUnplayed"] });
    expect(parseCollectionRoute("#/next/collection/box-1")).toEqual({ collectionId: "box-1", filters: [] });
  });

  it.each(["#/next/collection/", "#/next/collection/a/b", "#/next/browse/lib-1"])("rejects %s", (hash) => {
    expect(parseCollectionRoute(hash)).toBeUndefined();
  });
});

describe("replaceRoute", () => {
  it("rewrites the entry without a new one, keeps its state, and announces it", () => {
    window.history.replaceState({ focusEntry: "x:1" }, "", "#/next/browse/lib-1");
    const length = window.history.length;
    const heard = vi.fn();
    window.addEventListener(ROUTE_REPLACED_EVENT, heard);
    replaceRoute("#/next/browse/lib-1?sort=added-desc");
    window.removeEventListener(ROUTE_REPLACED_EVENT, heard);
    expect(window.location.hash).toBe("#/next/browse/lib-1?sort=added-desc");
    expect(window.history.length).toBe(length);
    expect(window.history.state).toEqual({ focusEntry: "x:1" });
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the hash is unchanged", () => {
    window.history.replaceState(null, "", "#/next/browse/lib-1");
    const heard = vi.fn();
    window.addEventListener(ROUTE_REPLACED_EVENT, heard);
    replaceRoute("#/next/browse/lib-1");
    window.removeEventListener(ROUTE_REPLACED_EVENT, heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
