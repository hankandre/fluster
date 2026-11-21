// The tripwire's gateways reach the server through the reference FetchTransport. The transport holds the
// token; the media requests (HLS playlists and segments, the static stream) authenticate with the header it
// builds, read here and never put in a URL (T2-04, decision 0005). T2-05 replaces this with the native client.
import { webCrypto } from "../../packages/core/src/adapters/web-crypto";
import { systemClock } from "../../packages/core/src/adapters/system-clock";
import { FetchTransport } from "../../packages/core/src/adapters/fetch-transport";
import type { ClientIdentity } from "../../packages/core/src/jellyfin/authorization-header";
import { JellyfinGateway } from "../../packages/core/src/jellyfin/gateway";
import type { LanHttpConfirmationStore } from "../../packages/core/src/lan-http-confirmations";
import type { StreamingLimitStore } from "../../packages/core/src/streaming-limits";

const transports = new WeakMap<JellyfinGateway, FetchTransport>();

export function newGateway(
  url: string,
  installId: string,
  confirmations: LanHttpConfirmationStore,
  limits: StreamingLimitStore,
  client: ClientIdentity,
): JellyfinGateway {
  const transport = new FetchTransport({ client, crypto: webCrypto, clock: systemClock });
  const gateway = new JellyfinGateway(url, webCrypto, transport, installId, confirmations, limits);
  transports.set(gateway, transport);
  return gateway;
}

// The signed-in Authorization header of a gateway made by newGateway. Never log it.
export function authorizationFor(gateway: JellyfinGateway): string {
  const transport = transports.get(gateway);
  if (!transport) throw new Error("This gateway was not made by newGateway.");
  return transport.authorizationHeader(gateway.sessionId());
}
