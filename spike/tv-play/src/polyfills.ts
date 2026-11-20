// Host globals the TypeScript core needs under Hermes (decision 0003, Finding 3): a WHATWG URL
// (React Native's own is regex-based) and crypto.subtle.digest for deriveDeviceId.
import "react-native-url-polyfill/auto";
import * as ExpoCrypto from "expo-crypto";

type DigestInput = Parameters<typeof ExpoCrypto.digest>[1];

const globalCrypto = ((globalThis as unknown as { crypto?: Record<string, unknown> }).crypto ?? {}) as Record<string, unknown>;
if (!(globalCrypto as { subtle?: unknown }).subtle) {
  globalCrypto.subtle = {
    digest(algorithm: string, data: DigestInput): Promise<ArrayBuffer> {
      if (algorithm !== "SHA-256") return Promise.reject(new Error(`unsupported digest ${algorithm}`));
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}
if (typeof globalCrypto.randomUUID !== "function") {
  globalCrypto.randomUUID = () => ExpoCrypto.randomUUID();
}
(globalThis as unknown as { crypto?: unknown }).crypto = globalCrypto;
