// Hashing and random ids for the core. The host supplies them (Node: WebCrypto; the TV: expo-crypto, T3-02).
export interface Crypto {
  sha256Hex(text: string): Promise<string>; // SHA-256 of the UTF-8 bytes, lowercase hex
  randomId(): string; // RFC 4122 version 4 UUID
}
