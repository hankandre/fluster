import { describe, expect, it } from "vitest";
import { toQuery } from "./query";

describe("toQuery", () => {
  it("keeps insertion order and writes values as strings", () => {
    expect(toQuery({ userId: "u", limit: 16, enableUserData: true, enableTotalRecordCount: false })).toEqual([
      ["userId", "u"],
      ["limit", "16"],
      ["enableUserData", "true"],
      ["enableTotalRecordCount", "false"],
    ]);
  });

  it("drops undefined values and keeps zero, false and the empty string", () => {
    expect(toQuery({ a: undefined, b: 0, c: false, d: "" })).toEqual([
      ["b", "0"],
      ["c", "false"],
      ["d", ""],
    ]);
  });

  it("does not encode: the transport does", () => {
    expect(toQuery({ searchTerm: "a b&c" })).toEqual([["searchTerm", "a b&c"]]);
  });

  it("returns no pairs for no params", () => {
    expect(toQuery({})).toEqual([]);
  });
});
