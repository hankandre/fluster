// The core's HttpTransport over expo/fetch with redirect "manual" (decision 0003: React Native's
// own fetch ignores it). The gateway gets no Axios instance when a transport is injected, so after
// sign-in this transport attaches the gateway's session header itself.
import { fetch } from "expo/fetch";
import type { HttpRequestConfig, HttpResponse, HttpTransport } from "../../../src/lib/jellyfin/types";

// The core's SDK names the client "Fluster"; the spike sends one identity, Octave, from JS and native.
export function asOctave(authorization: string): string {
  return authorization.replace(/Client="[^"]*"/, 'Client="Octave"');
}

const UNAUTHENTICATED_HEADER =
  'MediaBrowser Client="Octave", Device="Octave Play Falsifier", DeviceId="octave-unauthenticated", Version="0.0.1-spike"';

export class TransportStatusError extends Error {
  constructor(readonly response: { status: number }) {
    super(`HTTP ${response.status}`);
  }
}

export class ExpoFetchTransport implements HttpTransport {
  requests = 0;
  private sessionHeader?: () => string;

  constructor(private readonly serverUrl: string) {}

  useSessionHeader(header: () => string): void {
    this.sessionHeader = header;
  }

  get<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.send<T>("GET", url, undefined, config);
  }

  post<T>(url: string, data?: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.send<T>("POST", url, data, config);
  }

  delete<T>(url: string, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    return this.send<T>("DELETE", url, undefined, config);
  }

  // Before sign-in the gateway has no session header; the probe then carries a tokenless one, as
  // the core's SDK path does ("fluster-unauthenticated"), so every request has the header.
  private currentSessionHeader(): string | undefined {
    try {
      return this.sessionHeader?.();
    } catch {
      return undefined;
    }
  }

  private async send<T>(method: string, path: string, data: unknown, config?: HttpRequestConfig): Promise<HttpResponse<T>> {
    if (!path.startsWith("/")) throw new Error("the spike transport takes server paths only");
    const url = new URL(`${this.serverUrl}${path}`);
    for (const [key, value] of Object.entries(config?.params ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    const given = config?.headers?.Authorization;
    const authorization = given ?? this.currentSessionHeader() ?? UNAUTHENTICATED_HEADER;
    if (authorization) headers.Authorization = asOctave(authorization);
    let body: string | undefined;
    if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
    const controller = new AbortController();
    const timer = config?.timeout ? setTimeout(() => controller.abort(), config.timeout) : undefined;
    config?.signal?.addEventListener("abort", () => controller.abort());
    try {
      this.requests++;
      const response = await fetch(url.toString(), { method, headers, body, redirect: "manual", signal: controller.signal });
      const status = response.status;
      if (status === 0 || (status >= 300 && status < 400)) return { data: undefined as T, status };
      if (status < 200 || status >= 300) throw new TransportStatusError({ status });
      const text = await response.text();
      return { data: (text ? JSON.parse(text) : undefined) as T, status };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
