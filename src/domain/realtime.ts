// The only server-socket events the app sees. Rust drops everything else.
export type ServerEvent =
  | { kind: "user-data-changed"; itemIds: string[] }
  | { kind: "connection"; state: "connected" | "disconnected" };

// Port for the live server connection. The desktop adapter keeps the socket
// in Rust so the token travels in a header, never in a URL.
export interface RealtimeConnection {
  connect(serverUrl: string, authorization: string): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(listener: (event: ServerEvent) => void): Promise<() => void>;
}
