import { redactError, redactText } from "./redact";

// What a failed Jellyfin request means to the viewer. The raw message is
// transport text and never reaches the screen; the copy comes from the kind.
export type TransportErrorKind = "network" | "server" | "request";

const kinds = new WeakMap<object, TransportErrorKind>();

// Reads the code and status a transport error carries (ports/transport.ts), never the message text. Returns
// undefined for a cancellation and for anything that is not a request failure.
export function classifyTransportError(error: unknown): TransportErrorKind | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const known = kinds.get(error);
  if (known) return known;
  const { code, status } = error as { code?: unknown; status?: unknown };
  switch (code) {
    case "network":
    case "timeout":
      return "network";
    case "status":
      return typeof status === "number" && status >= 500 ? "server" : "request";
    case "refused":
    case "unexpected-response":
      return "request";
    default:
      return undefined;
  }
}

// An adapter may attach the request config (with its Authorization header), the request, the response or a cause
// to an error. Those must not reach callers or the Query cache, so a failure is rebuilt as a plain Error that
// keeps only the message, name, code, and status.
function hasTransportContext(error: object): boolean {
  return "config" in error || "request" in error || "response" in error || "cause" in error;
}

function stripTransportContext(error: object): Error {
  const source = error as { message?: unknown; name?: unknown; code?: unknown; status?: unknown };
  const plain = new Error(typeof source.message === "string" ? redactText(source.message) : "");
  if (typeof source.name === "string") plain.name = source.name;
  const extras: { code?: string; status?: number } = {};
  if (typeof source.code === "string") extras.code = source.code;
  if (typeof source.status === "number") extras.status = source.status;
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
