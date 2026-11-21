import { describe, expect, it } from "vitest";
import table from "../../tests/fixtures/host-classes.json";
import { classifyHost } from "./host-class";

describe("classifyHost", () => {
  it("covers every host class in the shared table", () => {
    const classes = new Set(table.vectors.map((vector) => vector.class));
    expect([...classes].sort()).toEqual(["loopback", "private-lan", "public"]);
  });

  it.each(table.vectors)("classifies $url as $class", ({ url, class: expected }) => {
    // Node versions disagree on some invalid IDNA hosts (Node 22 rejects
    // `xn--a.local`, Node 24 parses it). A URL that cannot be parsed is
    // refused before any request, so it may only appear as a public vector.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      expect(expected).toBe("public");
      return;
    }
    expect(classifyHost(parsed)).toBe(expected);
  });

  it("classifies the host the same way for every scheme and port", () => {
    expect(classifyHost(new URL("https://192.168.1.5:8920/jellyfin"))).toBe("private-lan");
    expect(classifyHost(new URL("ws://[::1]:8096/socket"))).toBe("loopback");
  });
});
