// @vitest-environment node
// T2-06 acceptance item 2: a server address whose host contains a non-ASCII character or an xn-- label is
// public for plain HTTP, whatever the host's URL parser does with it. The address as written is checked too.
import { describe, expect, it } from "vitest";
import table from "../../tests/fixtures/host-classes.json";
import { classifyHost, classifyServerAddress, hasPlainAsciiAuthority } from "./host-class";

// Non-printing and non-ASCII characters are escapes so the file shows what it tests.
const NEW_PUBLIC_VECTORS = [
  "http://ｎａｓ.local/", // fullwidth letters map to ASCII
  "http://nas。local/", // U+3002 maps to a dot
  "http://nas.loc­al/", // soft hyphen is dropped
  "http://naſ.local/", // long s folds to s
  "http://Kodi.local/", // Kelvin sign folds to k
  "http://ｌocalhost/", // loopback by mapping
  "http://１２７.0.0.1/", // fullwidth digits
  "http://nas.bücher.local/",
  "http://bücher.home.arpa/",
  "http://XN--BCHER-KVA.local/",
  "http://%6eas.local/",
  "http://1%30.0.0.1/",
  "http://%6c%6f%63%61%6c%68%6f%73%74/",
  "http://na\ts.local/", // a tab the parser removes
  "http:\\\\nas.local/", // backslashes read as slashes
  "http:/nas.local/",
  "http:nas.local",
];

const vectors = table.vectors as { url: string; class: string }[];

describe("non-ASCII and encoded hosts in the shared host-class file", () => {
  it.each(NEW_PUBLIC_VECTORS.map((url) => [url] as const))("has %j as a public vector", (url) => {
    expect(vectors.find((vector) => vector.url === url)).toEqual({ url, class: "public" });
  });

  it("keeps the existing internationalized and xn-- vectors", () => {
    for (const url of ["http://bücher.local/", "http://xn--a.local/", "http://xn--bcher-kva.local/", "http://nas.xn--bcher-kva.home.arpa/"]) {
      expect(vectors.find((vector) => vector.url === url)?.class).toBe("public");
    }
  });
});

describe("classifyServerAddress", () => {
  it.each(NEW_PUBLIC_VECTORS.map((url) => [url] as const))("classes %j as public", (url) => {
    expect(classifyServerAddress(url)).toBe("public");
  });

  it("classes every public vector in the file as public", () => {
    for (const vector of vectors.filter((entry) => entry.class === "public")) {
      expect(classifyServerAddress(vector.url), vector.url).toBe("public");
    }
  });

  it("keeps the class of a plain ASCII address, trimmed", () => {
    expect(classifyServerAddress("http://nas.local/")).toBe("private-lan");
    expect(classifyServerAddress("HTTP://Kodi.Local:8096/jellyfin")).toBe("private-lan");
    expect(classifyServerAddress("  http://192.168.1.5:8096  ")).toBe("private-lan");
    expect(classifyServerAddress("http://[::1]:8096")).toBe("loopback");
    expect(classifyServerAddress("http://localhost")).toBe("loopback");
    expect(classifyServerAddress("https://192.168.1.5:8920/jellyfin")).toBe("private-lan");
    expect(classifyServerAddress("http://3232235777/")).toBe("private-lan");
    expect(classifyServerAddress("http://media.example/")).toBe("public");
  });

  it("is not fooled by Unicode case folding, so the plain-ASCII pattern has no i or u flag", () => {
    expect(classifyServerAddress("http://naſ.local/")).toBe("public");
    expect(classifyServerAddress("http://Kodi.local/")).toBe("public");
  });

  it("classes an address with user info or a mangled scheme separator as public", () => {
    expect(classifyServerAddress("http://user@nas.local/")).toBe("public");
    expect(classifyServerAddress("http:///nas.local/")).toBe("public");
  });
});

describe("hasPlainAsciiAuthority", () => {
  it("accepts a plain ASCII authority and refuses the rest", () => {
    expect(hasPlainAsciiAuthority("http://nas.local:8096/jellyfin")).toBe(true);
    expect(hasPlainAsciiAuthority("https://[fd12::1]:8920")).toBe(true);
    expect(hasPlainAsciiAuthority("http://ｎａｓ.local/")).toBe(false);
    expect(hasPlainAsciiAuthority("http://%6eas.local/")).toBe(false);
    expect(hasPlainAsciiAuthority("http:\\\\nas.local/")).toBe(false);
    expect(hasPlainAsciiAuthority("http:nas.local")).toBe(false);
    expect(hasPlainAsciiAuthority("http://na\ts.local/")).toBe(false);
    expect(hasPlainAsciiAuthority("http://u:p@nas.local/")).toBe(false);
  });
});

describe("classifyHost on a parsed hostname", () => {
  it("classes a non-plain hostname as public, whatever parser produced it", () => {
    expect(classifyHost({ hostname: "bücher.local" })).toBe("public");
    expect(classifyHost({ hostname: "b%C3%BCcher.local" })).toBe("public");
    expect(classifyHost({ hostname: "XN--BCHER-KVA.local" })).toBe("public");
    expect(classifyHost({ hostname: "nas.XN--a.home.arpa" })).toBe("public");
  });

  it("still classes a plain hostname by the existing rules", () => {
    expect(classifyHost({ hostname: "nas.local" })).toBe("private-lan");
    expect(classifyHost({ hostname: "localhost" })).toBe("loopback");
    expect(classifyHost({ hostname: "[::1]" })).toBe("loopback");
  });
});
