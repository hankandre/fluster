import type { RealtimeConnection, ServerEvent } from "../../domain/realtime";

// Browser development mode has no server socket: the WebView cannot send the
// Authorization header on a WebSocket, and Fluster never puts a token in a
// URL. Rows simply do not refresh live there.
export class NoOpRealtime implements RealtimeConnection {
  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async subscribe(_listener: (event: ServerEvent) => void): Promise<() => void> {
    return () => undefined;
  }
}
