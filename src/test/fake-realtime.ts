import { vi } from "vitest";
import type { RealtimeConnection, ServerEvent } from "../domain/realtime";

// A RealtimeConnection that records calls and lets a test play server events.
export class FakeRealtime implements RealtimeConnection {
  readonly calls: string[] = [];
  readonly connect = vi.fn(async (serverUrl: string, authorization: string) => {
    this.calls.push(`connect ${serverUrl} ${authorization}`);
  });
  readonly disconnect = vi.fn(async () => {
    this.calls.push("disconnect");
  });
  private listeners = new Set<(event: ServerEvent) => void>();

  async subscribe(listener: (event: ServerEvent) => void): Promise<() => void> {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  emit(event: ServerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
