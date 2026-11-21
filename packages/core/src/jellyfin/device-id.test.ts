// T2-03 acceptance item 3: the DeviceId derivation takes its hash from the injected Crypto port and gives the same
// value as before for the same install id, server and user.
import { describe, expect, it, vi } from "vitest";
import { webCrypto } from "../adapters/web-crypto";
import type { Crypto } from "../ports/crypto";
import { deriveDeviceId } from "./device-id";

const LOUISE = "07bce1a97d44b7008418adc02ad74694142287bef4bd4007377574dc451aaf78";
const NON_ASCII = "53ec180397a5cca67368c4103ddb5e9c5ba4871bdbbcde8fb4d27a4badfdc0e5";

describe("deriveDeviceId", () => {
  it("keeps the value the gateway pinned before the Crypto port", async () => {
    expect(await deriveDeviceId(webCrypto, "install-1", "server-1", "Louise")).toBe(LOUISE);
    expect(await deriveDeviceId(webCrypto, "install-1", "server-1", "louise")).toBe(LOUISE);
  });

  it("keeps the UTF-8 encoding and the Unicode lowercasing", async () => {
    expect(await deriveDeviceId(webCrypto, "install-1", "server-1", "ZOË Ångström")).toBe(NON_ASCII);
  });

  it("hands the lowercased input string to the port and returns its digest", async () => {
    const crypto: Crypto = { sha256Hex: vi.fn(async () => "fake-digest"), randomId: vi.fn(() => "fake-id") };
    expect(await deriveDeviceId(crypto, "install-1", "server-1", "Louise")).toBe("fake-digest");
    expect(crypto.sha256Hex).toHaveBeenCalledTimes(1);
    expect(crypto.sha256Hex).toHaveBeenCalledWith("install-1:server-1:louise");
  });
});
