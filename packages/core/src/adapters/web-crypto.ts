import type { Crypto } from "../ports/crypto";

/** The reference Crypto for Node tests and the tripwire, built on WebCrypto. */
export const webCrypto: Crypto = {
  async sha256Hex(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },
  randomId() {
    return crypto.randomUUID();
  },
};
