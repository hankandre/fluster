import { describe, expect, it } from "vitest";
import { webCrypto } from "./web-crypto";

describe("webCrypto", () => {
  it("hashes UTF-8 text to lowercase SHA-256 hex", async () => {
    expect(await webCrypto.sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("returns a version 4 UUID", () => {
    expect(webCrypto.randomId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
