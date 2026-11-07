// Browser-storage adapter for the user's "connect without encryption"
// choices (docs/decisions/0001). Each record is a server Id and the exact
// origin it answered at. Records hold no secret and are never derived from a
// token, so they may live in ordinary preferences.

export const LAN_HTTP_CONFIRMATIONS_STORAGE_KEY = "fluster.lanHttpConfirmations";

export interface LanHttpConfirmation {
  serverId: string;
  origin: string;
}

export interface LanHttpConfirmationStore {
  has(confirmation: LanHttpConfirmation): boolean;
  remember(confirmation: LanHttpConfirmation): void;
}

function isConfirmation(value: unknown): value is LanHttpConfirmation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.serverId === "string" && typeof record.origin === "string";
}

function sameConfirmation(a: LanHttpConfirmation, b: LanHttpConfirmation): boolean {
  return a.serverId === b.serverId && a.origin === b.origin;
}

export class BrowserLanHttpConfirmations implements LanHttpConfirmationStore {
  // Used when storage is blocked or unavailable, so a confirmation still
  // holds for the rest of this launch.
  private readonly memory: LanHttpConfirmation[] = [];

  has(confirmation: LanHttpConfirmation): boolean {
    return this.read().some((stored) => sameConfirmation(stored, confirmation));
  }

  remember(confirmation: LanHttpConfirmation): void {
    if (this.has(confirmation)) return;
    const record = { serverId: confirmation.serverId, origin: confirmation.origin };
    this.memory.push(record);
    try {
      const stored = this.readStorage();
      window.localStorage.setItem(LAN_HTTP_CONFIRMATIONS_STORAGE_KEY, JSON.stringify([...stored, record]));
    } catch {
      // Keep the in-memory record only.
    }
  }

  private read(): LanHttpConfirmation[] {
    try {
      return [...this.readStorage(), ...this.memory];
    } catch {
      return this.memory;
    }
  }

  private readStorage(): LanHttpConfirmation[] {
    const raw = window.localStorage.getItem(LAN_HTTP_CONFIRMATIONS_STORAGE_KEY);
    if (!raw) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    return Array.isArray(parsed) ? parsed.filter(isConfirmation) : [];
  }
}

// One store per app launch, so the in-memory fallback outlives a gateway.
export const lanHttpConfirmations = new BrowserLanHttpConfirmations();
