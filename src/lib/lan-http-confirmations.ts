// Types and an in-memory store for the user's "connect without encryption"
// choices (docs/decisions/0001). Each record is a server Id and the exact
// origin it answered at. Records hold no secret and are never derived from a
// token, so they may live in ordinary preferences.

export interface LanHttpConfirmation {
  serverId: string;
  origin: string;
}

export interface LanHttpConfirmationStore {
  has(confirmation: LanHttpConfirmation): boolean;
  remember(confirmation: LanHttpConfirmation): void;
}

export function isConfirmation(value: unknown): value is LanHttpConfirmation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.serverId === "string" && typeof record.origin === "string";
}

export function sameConfirmation(a: LanHttpConfirmation, b: LanHttpConfirmation): boolean {
  return a.serverId === b.serverId && a.origin === b.origin;
}

// Shell-neutral store: holds confirmations for this launch only. Shells that
// can persist them supply their own LanHttpConfirmationStore.
export class MemoryLanHttpConfirmations implements LanHttpConfirmationStore {
  private readonly records: LanHttpConfirmation[] = [];

  has(confirmation: LanHttpConfirmation): boolean {
    return this.records.some((stored) => sameConfirmation(stored, confirmation));
  }

  remember(confirmation: LanHttpConfirmation): void {
    if (this.has(confirmation)) return;
    this.records.push({ serverId: confirmation.serverId, origin: confirmation.origin });
  }
}
