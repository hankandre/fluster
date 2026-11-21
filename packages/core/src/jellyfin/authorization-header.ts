// The MediaBrowser Authorization value the reference transport sends. On Android the header is built in Kotlin
// (decision 0005); packages/core/tests/fixtures/authorization-header.json holds the values both builders must
// match byte for byte.

// What the server shows for this client in its device list. The composition root supplies both; the core
// reads no build or platform globals.
export interface ClientIdentity {
  version: string;
  deviceName: string;
}

export interface AuthorizationInputs {
  client: string;
  device: string;
  deviceId: string;
  version: string;
  token?: string;
}

// Each value is quoted and passed through encodeURIComponent; a missing token is written as Token="".
export function buildAuthorizationHeader(inputs: AuthorizationInputs): string {
  const field = (name: string, value: string) => `${name}="${encodeURIComponent(value)}"`;
  return `MediaBrowser ${[
    field("Client", inputs.client),
    field("Device", inputs.device),
    field("DeviceId", inputs.deviceId),
    field("Version", inputs.version),
    field("Token", inputs.token ?? ""),
  ].join(", ")}`;
}
