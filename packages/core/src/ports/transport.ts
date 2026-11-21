// How the core reaches a Jellyfin or Jellyscale server (decision 0005). The core holds an opaque session id and
// never a token: the host's transport owns the token, builds the Authorization header, and follows no redirect.
// The core's port is a subset of the native session surface (signIn, request, endSession); restoreSessions and
// sessionEnded arrive with T4-05. Android implements it in Kotlin (T3-05); adapters/fetch-transport.ts is the
// reference implementation for Node tests and the tripwire.

// Opaque: made by the transport at sign-in. Not derived from the token; means nothing to the server.
export type SessionId = string;
export type TransportMethod = "GET" | "POST" | "DELETE";
export type QueryPair = readonly [name: string, value: string];

// After sign-in a request names its session. Before sign-in it names the server (its base URL) and the DeviceId
// to put in the tokenless header, and may use only PRE_SIGN_IN_ROUTES.
export type TransportTarget =
  | { readonly session: SessionId }
  | { readonly server: string; readonly deviceId: string };

export interface TransportRequest {
  readonly target: TransportTarget;
  readonly method: TransportMethod;
  readonly path: string; // starts with "/", no "?" and no "#"
  readonly query?: readonly QueryPair[]; // decoded pairs, in order; the transport encodes them
  readonly body?: unknown; // a JSON value; absent means no body
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface TransportResponse {
  readonly status: number; // 200-299 or 400-599; a redirect never comes back as a response
  readonly body: unknown; // the parsed JSON, or undefined when empty or not JSON
}

export type SignInCredential =
  | { readonly kind: "password"; readonly username: string; readonly password: string }
  | { readonly kind: "quick-connect"; readonly secret: string };

export interface SignInRequest {
  readonly server: string;
  readonly deviceId: string;
  readonly credential: SignInCredential;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface SignInResult {
  readonly session: SessionId;
  readonly userId: string;
  readonly userName?: string;
  readonly serverId?: string;
}

export interface Transport {
  signIn(request: SignInRequest): Promise<SignInResult>;
  request(request: TransportRequest): Promise<TransportResponse>;
  // Always ends the session locally. Rejects only to report that the server logout failed.
  endSession(session: SessionId, options: { readonly timeoutMs: number }): Promise<void>;
}

// The only routes a transport sends without a session. Each is tokenless.
export const PRE_SIGN_IN_ROUTES = [
  "GET /System/Info/Public",
  "GET /QuickConnect/Enabled",
  "POST /QuickConnect/Initiate",
  "GET /QuickConnect/Connect",
] as const;

export type TransportErrorCode =
  | "network"
  | "timeout"
  | "redirect"
  | "cancelled"
  | "refused"
  | "unexpected-response"
  | "status";

const MESSAGES: Record<TransportErrorCode, string> = {
  "network": "The request could not reach the server.",
  "timeout": "The server did not answer in time.",
  "redirect": "The server answered with a redirect.",
  "cancelled": "The request was cancelled.",
  "refused": "The request was refused before it was sent.",
  "unexpected-response": "The server's answer could not be used.",
  "status": "The server answered with an error status.",
};

// The only error a transport may reject with. The message is fixed text per code: no URL, header or body.
export class TransportError extends Error {
  readonly code: TransportErrorCode;
  declare readonly status?: number;

  constructor(code: TransportErrorCode, status?: number) {
    super(MESSAGES[code]);
    // A cancelled request keeps the name callers already test for.
    this.name = code === "cancelled" ? "AbortError" : "TransportError";
    this.code = code;
    if (status !== undefined) (this as { status?: number }).status = status;
  }
}
