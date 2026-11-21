import { APP_NAME } from "../domain/app-identity";
import { buildAuthorizationHeader, type ClientIdentity } from "../jellyfin/authorization-header";
import { isCredentialQueryName } from "../jellyfin/credential-query";
import type { Clock } from "../ports/clock";
import type { Crypto } from "../ports/crypto";
import {
  PRE_SIGN_IN_ROUTES,
  TransportError,
  type QueryPair,
  type SessionId,
  type SignInRequest,
  type SignInResult,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from "../ports/transport";

// The reference Transport, for Node tests and the tripwire. It stands in for Kotlin's OkHttp client (T3-05), so
// it follows the port's rules (decision 0005): the token stays in this class and never leaves it, the header
// is built here, no redirect is followed, and no error carries a URL, header or body.
//
// The sessions live in an ECMAScript #private field, not a TypeScript `private` one: a TypeScript `private`
// member is an ordinary property at run time, so a walk of the gateway (which holds this transport) would
// reach the token. Do not turn these into `private` members.

export interface FetchTransportOptions {
  client: ClientIdentity;
  crypto: Crypto;
  clock: Clock;
}

interface Session {
  readonly server: string;
  readonly deviceId: string;
  readonly token: string;
}

const REDACTED = "[redacted]";

// What Axios 1.21.1 wrote for a query pair (buildURL.js): encodeURIComponent, then `:`, `$` and `,` left bare and
// a space as `+`. The Jellyfin wire golden compares the raw string, so the bytes stay the same.
function encodeQueryPart(text: string): string {
  return encodeURIComponent(text).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}

function encodeQuery(pairs: readonly QueryPair[]): string {
  return pairs.map(([name, value]) => `${encodeQueryPart(name)}=${encodeQueryPart(value)}`).join("&");
}

function isRedirectStatus(status: number): boolean {
  return status === 0 || (status >= 300 && status < 400);
}

function parseJson(text: string): unknown {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export class FetchTransport implements Transport {
  readonly #client: ClientIdentity;
  readonly #crypto: Crypto;
  readonly #clock: Clock;
  readonly #sessions = new Map<SessionId, Session>();

  constructor(options: FetchTransportOptions) {
    this.#client = options.client;
    this.#crypto = options.crypto;
    this.#clock = options.clock;
  }

  async signIn(request: SignInRequest): Promise<SignInResult> {
    const server = this.#normalizeServer(request.server);
    const { path, body } =
      request.credential.kind === "password"
        ? { path: "/Users/AuthenticateByName", body: { Username: request.credential.username, Pw: request.credential.password } }
        : { path: "/Users/AuthenticateWithQuickConnect", body: { Secret: request.credential.secret } };
    const answer = await this.#send({
      url: `${server}${path}`,
      method: "POST",
      authorization: this.#header(request.deviceId),
      body,
      timeoutMs: request.timeoutMs,
      signal: request.signal,
    });
    if (answer.status < 200 || answer.status >= 300) throw new TransportError("status", answer.status);
    const data = parseJson(answer.text) as { AccessToken?: unknown; User?: { Id?: unknown; Name?: unknown }; ServerId?: unknown } | undefined;
    const token = data?.AccessToken;
    const userId = data?.User?.Id;
    if (typeof token !== "string" || token === "" || typeof userId !== "string" || userId === "") {
      throw new TransportError("unexpected-response");
    }
    const session = this.#crypto.randomId();
    this.#sessions.set(session, { server, deviceId: request.deviceId, token });
    return {
      session,
      userId,
      ...(typeof data?.User?.Name === "string" ? { userName: data.User.Name } : {}),
      ...(typeof data?.ServerId === "string" ? { serverId: data.ServerId } : {}),
    };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    const { path, query } = request;
    if (!path.startsWith("/") || path.startsWith("//") || /[?#]/.test(path)) throw new TransportError("refused");
    if (!(request.timeoutMs > 0)) throw new TransportError("refused");
    const pairs = query ?? [];
    if (pairs.some(([name]) => isCredentialQueryName(name))) throw new TransportError("refused");

    let server: string;
    let deviceId: string;
    let token: string | undefined;
    if ("session" in request.target) {
      const session = this.#sessions.get(request.target.session);
      if (!session) throw new TransportError("refused");
      ({ server, deviceId, token } = session);
    } else {
      if (!(PRE_SIGN_IN_ROUTES as readonly string[]).includes(`${request.method} ${path}`)) throw new TransportError("refused");
      server = this.#normalizeServer(request.target.server);
      deviceId = request.target.deviceId;
    }

    const queryText = encodeQuery(pairs);
    if (token !== undefined && [path, queryText, ...pairs.flat()].some((text) => this.#carries(token, text))) throw new TransportError("refused");

    const answer = await this.#send({
      url: queryText === "" ? `${server}${path}` : `${server}${path}?${queryText}`,
      method: request.method,
      authorization: this.#header(deviceId, token),
      body: request.body,
      timeoutMs: request.timeoutMs,
      signal: request.signal,
    });
    if (isRedirectStatus(answer.status)) throw new TransportError("redirect");
    const body = parseJson(answer.text);
    return { status: answer.status, body: token === undefined ? body : this.#strip(body, token) };
  }

  async endSession(session: SessionId, options: { readonly timeoutMs: number }): Promise<void> {
    const entry = this.#sessions.get(session);
    if (!entry) return;
    // The session ends here first: the server call that follows can fail and the token is still gone.
    this.#sessions.delete(session);
    const answer = await this.#send({
      url: `${entry.server}/Sessions/Logout`,
      method: "POST",
      authorization: this.#header(entry.deviceId, entry.token),
      timeoutMs: options.timeoutMs,
    });
    if (answer.status < 200 || answer.status >= 300) throw new TransportError("status", answer.status);
  }

  // The signed-in Authorization header, for the tripwire's media requests. Not on the port (decision 0005: the
  // native player gets a session id and the one authenticated client, never a header); remove with T2-05.
  authorizationHeader(session: SessionId): string {
    const entry = this.#sessions.get(session);
    if (!entry) throw new Error("Sign in before using the library.");
    return this.#header(entry.deviceId, entry.token);
  }

  #header(deviceId: string, token?: string): string {
    return buildAuthorizationHeader({
      client: APP_NAME,
      device: this.#client.deviceName,
      deviceId,
      version: this.#client.version,
      token,
    });
  }

  // The base URL: scheme, host, port and any base path, no trailing slash, no query, no user info.
  #normalizeServer(server: string): string {
    let url: URL;
    try {
      url = new URL(server);
    } catch {
      throw new TransportError("refused");
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) throw new TransportError("refused");
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  }

  #carries(token: string, text: string): boolean {
    if (token === "") return false;
    return text.includes(token) || text.includes(encodeURIComponent(token)) || text.includes(encodeQueryPart(token));
  }

  // Replaces the token, as written and percent-encoded, in every string of a parsed body.
  #strip(value: unknown, token: string): unknown {
    if (token === "") return value;
    const encoded = encodeURIComponent(token);
    const forms = [token, encoded, encoded.replace(/%[0-9A-F]{2}/g, (escape) => escape.toLowerCase()), encodeQueryPart(token)];
    const clean = (text: string): string => forms.reduce((current, form) => (form === "" ? current : current.split(form).join(REDACTED)), text);
    const visit = (node: unknown): unknown => {
      if (typeof node === "string") return clean(node);
      if (Array.isArray(node)) return node.map(visit);
      if (typeof node === "object" && node !== null) {
        const copy: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(node)) copy[clean(key)] = visit(entry);
        return copy;
      }
      return node;
    };
    return visit(value);
  }

  async #send(options: {
    url: string;
    method: string;
    authorization: string;
    body?: unknown;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<{ status: number; text: string }> {
    const { signal } = options;
    if (signal?.aborted) throw new TransportError("cancelled");
    const controller = new AbortController();
    const stop: { reason?: "timeout" | "cancelled" } = {};
    const cancelTimer = this.#clock.after(options.timeoutMs, () => {
      stop.reason ??= "timeout";
      controller.abort();
    });
    const onAbort = () => {
      stop.reason ??= "cancelled";
      controller.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const headers: Record<string, string> = { Authorization: options.authorization, Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    try {
      // The one place in the core that sets `redirect: "manual"`: a server or anyone on the path must not be able
      // to move the token, or the probe, to another origin (decision 0001, edge case 8).
      const response = await fetch(options.url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "manual",
        signal: controller.signal,
      });
      if (isRedirectStatus(response.status)) throw new TransportError("redirect");
      return { status: response.status, text: await response.text() };
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError(stop.reason ?? "network");
    } finally {
      cancelTimer();
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
