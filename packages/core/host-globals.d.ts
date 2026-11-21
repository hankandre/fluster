// The host contract: every global the core reads that the TypeScript ES2022
// library does not declare. Adding a global here is an architecture change
// (ARCHITECTURE.md section 2); prefer a port in src/ports/.
//
// Every host must provide these six (on the TV, URL comes from a polyfill,
// decision 0004):
//   URL, URLSearchParams, AbortController, AbortSignal, console, Blob.
//
// Only the reference adapters in src/adapters/ use the next six. A host that
// supplies its own Clock and Crypto does not need them, so the TV must not
// polyfill crypto.subtle for the core:
//   crypto, TextEncoder, setTimeout, clearTimeout, setInterval, clearInterval.
//
// Each member is typed only as far as core source uses it.

interface AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}
declare var AbortSignal: {
  prototype: AbortSignal;
};

interface AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}
declare var AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

interface URLSearchParams {
  append(name: string, value: string): void;
  delete(name: string): void;
  keys(): IterableIterator<string>;
  set(name: string, value: string): void;
  [Symbol.iterator](): IterableIterator<[string, string]>;
}
declare var URLSearchParams: {
  prototype: URLSearchParams;
  new (init?: string): URLSearchParams;
};

interface URL {
  hash: string;
  readonly hostname: string;
  readonly origin: string;
  password: string;
  pathname: string;
  readonly protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
  username: string;
}
declare var URL: {
  prototype: URL;
  new (url: string, base?: string): URL;
};

interface TextEncoder {
  encode(input?: string): Uint8Array;
}
declare var TextEncoder: {
  prototype: TextEncoder;
  new (): TextEncoder;
};

// Opaque: core code only passes a Blob through (trickplay tiles).
interface Blob {}

declare var console: { warn(...data: unknown[]): void };

declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(handler: () => void, timeout?: number): unknown;
declare function clearInterval(id: unknown): void;

declare var crypto: {
  readonly subtle: { digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer> };
  randomUUID(): string;
};
