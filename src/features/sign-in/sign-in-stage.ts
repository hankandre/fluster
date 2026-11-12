import type { SessionGateway } from "../../app/session";

export type Stage =
  | { name: "server" }
  | { name: "quick-connect"; gateway: SessionGateway }
  | { name: "password"; gateway: SessionGateway };

// A failed Quick Connect check only means the password form is used.
export async function chooseSignInStage(gateway: SessionGateway, signal: AbortSignal): Promise<Stage> {
  const quickConnect = await gateway.quickConnectEnabled(signal).catch(() => false);
  return { name: quickConnect ? "quick-connect" : "password", gateway };
}
