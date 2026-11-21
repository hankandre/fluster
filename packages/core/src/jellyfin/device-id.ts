// The server keeps one token per DeviceId, so the id must be stable across
// launches. It is the SHA-256 hex of the install id, server id, and user.
//
// The login request itself carries the DeviceId, and the user id is unknown
// before authentication. The lowercased username stands in for the user id.
export async function deriveDeviceId(installId: string, serverId: string, username: string): Promise<string> {
  const input = new TextEncoder().encode(`${installId}:${serverId}:${username.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
