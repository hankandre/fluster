import { redactError, redactText } from "./redact";

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

// Axios attaches the request config (with the Authorization default header),
// the request, and the response (with its own config and headers) to errors.
// Those must not reach callers or the Query cache, so a failed request is
// rebuilt as a plain Error that keeps only the message, name, code, and status.
function hasTransportContext(error: object): boolean {
  return "config" in error || "request" in error || "response" in error || "cause" in error;
}

function stripTransportContext(error: object): Error {
  const source = error as { message?: unknown; name?: unknown; code?: unknown; isAxiosError?: unknown; response?: { status?: unknown } };
  const plain = new Error(typeof source.message === "string" ? redactText(source.message) : "");
  if (typeof source.name === "string") plain.name = source.name;
  const extras: { code?: string; isAxiosError?: true; response?: { status: number } } = {};
  if (typeof source.code === "string") extras.code = source.code;
  if (source.isAxiosError === true) extras.isAxiosError = true;
  const status = source.response?.status;
  if (typeof status === "number") extras.response = { status };
  return Object.assign(plain, extras);
}

// Redacts like redactError, drops config, request, and response internals, and
// remembers the kind on the result.
export function redactTransportError(error: unknown): unknown {
  const kind = classifyTransportError(error);
  const redacted =
    typeof error === "object" && error !== null && hasTransportContext(error)
      ? stripTransportContext(error)
      : redactError(error);
  if (kind && typeof redacted === "object" && redacted !== null) kinds.set(redacted, kind);
  return redacted;
}
