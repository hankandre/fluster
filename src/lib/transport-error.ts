import { redactError } from "./redact";

// What a failed Jellyfin request means to the viewer. The raw message is
// transport text and never reaches the screen; the copy comes from the kind.
export type TransportErrorKind = "network" | "server" | "request";

const kinds = new WeakMap<object, TransportErrorKind>();

const NETWORK_CODES = new Set([
  "ERR_NETWORK",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

// Reads Axios's own fields (status, code), never the message text. Returns
// undefined for a cancellation and for anything that is not a request failure.
export function classifyTransportError(error: unknown): TransportErrorKind | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const known = kinds.get(error);
  if (known) return known;
  const candidate = error as { name?: unknown; code?: unknown; isAxiosError?: unknown; response?: { status?: unknown } };
  if (candidate.name === "AbortError" || candidate.code === "ERR_CANCELED") return undefined;
  const status = candidate.response?.status;
  if (typeof status === "number") return status >= 500 ? "server" : "request";
  if (candidate.name === "TimeoutError") return "network";
  if (typeof candidate.code === "string" && NETWORK_CODES.has(candidate.code)) return "network";
  if (candidate.isAxiosError === true) return "network";
  return undefined;
}

// Redacts like redactError and remembers the kind on the result, which may be
// a new Error when redaction changed the message.
export function redactTransportError(error: unknown): unknown {
  const kind = classifyTransportError(error);
  const redacted = redactError(error);
  if (kind && typeof redacted === "object" && redacted !== null) kinds.set(redacted, kind);
  return redacted;
}
