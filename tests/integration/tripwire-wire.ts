// The tripwire's wire layer (T2-09): the one fetch every player-side request goes through, a recorder that sees
// every request the run makes (the gateway's transport, the monitor and the player), and the pure rule over the
// record. The recorder keeps what a request looked like, never a header value, a query value outside PlaybackInfo's
// flags, or a body.
import { isCredentialName } from "./tripwire-rules";

export interface WireRecord {
  method: string;
  origin: string;
  path: string;
  queryNames: string[];
  // Set for POST /Items/{id}/PlaybackInfo only: the query pairs and the JSON body's top-level boolean fields.
  queryPairs?: [string, string][];
  flags?: Record<string, boolean>;
  hasAuthorization: boolean;
  scheme?: string;
  hasToken: boolean;
  urlHoldsSecret: boolean;
  redirectMode?: string;
  status?: number;
}

export interface PlayerFetchOptions {
  authorization: string;
  range?: string;
  // Injected by tests; the global fetch is read at call time so the recorder sees the request.
  fetch?: typeof fetch;
}

// How a player reads media: the signed-in Authorization header on every request, ranged when asked, and no
// redirect followed (a redirect could lead to a transcode URL). A player with no header is a failed run.
export async function playerFetch(url: string, options: PlayerFetchOptions): Promise<Response> {
  if (!options.authorization) throw new Error("playerFetch needs the Authorization header; a media request without it is a failed run");
  const headers: Record<string, string> = { Authorization: options.authorization };
  if (options.range) headers.Range = options.range;
  return (options.fetch ?? globalThis.fetch)(url, { headers, redirect: "manual" });
}

const PLAYBACK_INFO_PATH = /^\/Items\/[^/]+\/PlaybackInfo$/i;

function headerValue(input: Request | URL | string, init: RequestInit | undefined, name: string): string | undefined {
  if (init?.headers !== undefined) return new Headers(init.headers).get(name) ?? undefined;
  if (typeof Request !== "undefined" && input instanceof Request) return input.headers.get(name) ?? undefined;
  return undefined;
}

function bodyFlags(body: unknown): Record<string, boolean> | undefined {
  if (typeof body !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const flags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) if (typeof value === "boolean") flags[key] = value;
    return flags;
  } catch {
    return undefined;
  }
}

// Replaces globalThis.fetch once, before any gateway exists. secrets is read at each request, so a token learned
// at sign-in is covered from then on. restore() puts the previous fetch back.
export function installWireRecorder(secrets: Iterable<string>): { records: WireRecord[]; restore(): void } {
  const previous = globalThis.fetch;
  const records: WireRecord[] = [];
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    const method = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    const authorization = headerValue(input, init, "authorization");
    const record: WireRecord = {
      method,
      origin: url.origin,
      path: url.pathname,
      queryNames: [...url.searchParams.keys()],
      hasAuthorization: authorization !== undefined && authorization !== "",
      scheme: authorization ? authorization.trim().split(/\s+/)[0] : undefined,
      hasToken: /Token="[^"]+"/.test(authorization ?? ""),
      urlHoldsSecret: [...secrets].some((secret) => secret.length > 0 && raw.includes(secret)),
      redirectMode: init?.redirect,
    };
    if (method === "POST" && PLAYBACK_INFO_PATH.test(url.pathname)) {
      record.queryPairs = [...url.searchParams];
      record.flags = bodyFlags(init?.body);
    }
    records.push(record);
    const response = await previous(input, init);
    record.status = response.status;
    return response;
  }) as typeof fetch;
  return {
    records,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

// Routes the gateway and the monitor call before any sign-in. Widen by exact route, never by pattern.
const UNAUTHENTICATED_ROUTES = ["GET /System/Info/Public", "POST /Users/AuthenticateByName"];

// The hard rule, over every request of one server: the header on every request, no token in any URL, no
// redirect followed, no other origin contacted. Returns the failures; an empty record is itself a failure.
export function checkWireRequests(records: readonly WireRecord[], serverOrigin: string): string[] {
  if (records.length === 0) return ["wire: no request was recorded for this server, so the rule saw nothing"];
  const failures: string[] = [];
  for (const record of records) {
    const label = `${record.method} ${record.path}`;
    const problem = (message: string) => failures.push(`wire: ${label}: ${message}`);
    if (record.origin !== serverOrigin) problem(`sent to ${record.origin}, not the server`);
    if (!record.hasAuthorization) problem("no Authorization header");
    else if (record.scheme !== "MediaBrowser") problem(`Authorization scheme ${record.scheme ?? "none"}, expected MediaBrowser`);
    if (!record.hasToken && !UNAUTHENTICATED_ROUTES.includes(label)) problem("no Token= in the Authorization header on a signed-in route");
    const credential = record.queryNames.find(isCredentialName);
    if (credential !== undefined) problem(`credential query parameter ${credential.trim()}`);
    if (record.urlHoldsSecret) problem("the URL holds a known secret");
    if (record.redirectMode !== "manual") problem(`redirect mode ${record.redirectMode ?? "default"}, expected manual`);
    if (record.status !== undefined && record.status >= 300 && record.status < 400) problem(`answered ${record.status}`);
  }
  return failures;
}
