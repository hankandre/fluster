import {
  TransportError,
  type QueryPair,
  type SessionId,
  type SignInRequest,
  type SignInResult,
  type Transport,
  type TransportMethod,
  type TransportRequest,
  type TransportResponse,
  type TransportTarget,
} from "../ports/transport";

// A recording Transport for gateway tests, in the style of ports/fake-clock.ts: ordinary source that imports no
// test library and no adapter. Answers are keyed by "METHOD /path". A sign-in is answered from the entry for its
// route ("POST /Users/AuthenticateByName" or "POST /Users/AuthenticateWithQuickConnect") the way a server would:
// the user comes from `User`, and an answer without `AccessToken` or `User.Id` is an unexpected-response. The
// token stays in that entry; the fake never hands it to the gateway.

export interface RecordedRequest {
  method: TransportMethod;
  url: string;
  data?: unknown;
  // The decoded pairs, in the order the gateway sent them.
  query: QueryPair[];
  // The same pairs as an object (a repeated name keeps its last value), for subset assertions.
  params: Record<string, string>;
  target: TransportTarget;
  signal?: AbortSignal;
  timeout: number;
}

const SIGN_IN_KEYS = ["POST /Users/AuthenticateByName", "POST /Users/AuthenticateWithQuickConnect"] as const;

export class FakeTransport implements Transport {
  requests: RecordedRequest[] = [];
  signIns: SignInRequest[] = [];
  ended: SessionId[] = [];
  endTimeouts: number[] = [];
  responses = new Map<string, unknown>();
  // The status to resolve a request with; 200 when absent.
  statuses = new Map<string, number>();
  // An error to reject a request with, in place of an answer.
  failures = new Map<string, unknown>();
  signInError?: unknown;
  endSessionError?: unknown;
  private sessions = 0;

  async signIn(request: SignInRequest): Promise<SignInResult> {
    this.signIns.push(request);
    if (this.signInError) throw this.signInError;
    const route = request.credential.kind === "password" ? SIGN_IN_KEYS[0] : SIGN_IN_KEYS[1];
    const failure = this.failures.get(route);
    if (failure) throw failure;
    const answer = this.responses.get(route) as { AccessToken?: string; User?: { Id?: string; Name?: string } } | undefined;
    if (!answer?.AccessToken || !answer.User?.Id) throw new TransportError("unexpected-response");
    this.sessions += 1;
    return { session: `session-${this.sessions}`, userId: answer.User.Id, ...(answer.User.Name ? { userName: answer.User.Name } : {}) };
  }

  async request(request: TransportRequest): Promise<TransportResponse> {
    const query = [...(request.query ?? [])];
    this.requests.push({
      method: request.method,
      url: request.path,
      ...(request.body === undefined ? {} : { data: request.body }),
      query,
      params: Object.fromEntries(query),
      target: request.target,
      signal: request.signal,
      timeout: request.timeoutMs,
    });
    const key = `${request.method} ${request.path}`;
    const failure = this.failures.get(key);
    if (failure) throw failure;
    return { status: this.statuses.get(key) ?? 200, body: this.responses.get(key) };
  }

  async endSession(session: SessionId, options: { readonly timeoutMs: number }): Promise<void> {
    this.ended.push(session);
    this.endTimeouts.push(options.timeoutMs);
    if (this.endSessionError) throw this.endSessionError;
  }
}
