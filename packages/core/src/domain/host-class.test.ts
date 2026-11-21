import { describe, expect, it } from "vitest";
import table from "../../tests/fixtures/host-classes.json";
import { classifyHost, classifyServerAddress } from "./host-class";

describe("classifyHost", () => {
  it("covers every host class in the shared table", () => {
    const classes = new Set(table.vectors.map((vector) => vector.class));
    expect([...classes].sort()).toEqual(["loopback", "private-lan", "public"]);
  });

  // classifyServerAddress holds the parse: an address the host's URL cannot parse is public, which is refused
  // before any request.
  it.each(table.vectors)("classifies $url as $class", ({ url, class: expected }) => {
    expect(classifyServerAddress(url)).toBe(expected);
  });

  it("classifies the host the same way for every scheme and port", () => {
    expect(classifyHost(new URL("https://192.168.1.5:8920/jellyfin"))).toBe("private-lan");
    expect(classifyHost(new URL("ws://[::1]:8096/socket"))).toBe("loopback");
  });
});
