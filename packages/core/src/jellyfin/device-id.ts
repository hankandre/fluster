import type { Crypto } from "../ports/crypto";

// The server keeps one token per DeviceId, so the id must be stable across
// launches. It is the SHA-256 hex of the install id, server id, and user.
//
// The login request itself carries the DeviceId, and the user id is unknown
// before authentication. The lowercased username stands in for the user id.
export function deriveDeviceId(crypto: Crypto, installId: string, serverId: string, username: string): Promise<string> {
  return crypto.sha256Hex(`${installId}:${serverId}:${username.toLowerCase()}`);
}
