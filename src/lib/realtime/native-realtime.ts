import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { RealtimeConnection, ServerEvent } from "../../domain/realtime";

const SERVER_EVENT = "fluster://server-event";

export class NativeRealtime implements RealtimeConnection {
  // Connect and disconnect run strictly in call order, so a quick
  // sign-out/sign-in can never leave the old socket open.
  private pending: Promise<unknown> = Promise.resolve();

  connect(serverUrl: string, authorization: string): Promise<void> {
    return this.inOrder(() => invoke("realtime_connect", { serverUrl, authorization }));
  }

  disconnect(): Promise<void> {
    return this.inOrder(() => invoke("realtime_disconnect"));
  }

  subscribe(listener: (event: ServerEvent) => void): Promise<() => void> {
    return listen<ServerEvent>(SERVER_EVENT, ({ payload }) => listener(payload));
  }

  private async inOrder(call: () => Promise<unknown>): Promise<void> {
    const next = this.pending.then(call, call);
    this.pending = next.catch(() => undefined);
    await next;
  }
}
