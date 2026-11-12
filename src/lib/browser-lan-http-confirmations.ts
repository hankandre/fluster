// Browser-storage adapter for the user's "connect without encryption"
// choices (docs/decisions/0001). Records hold no secret and are never derived
// from a token, so they may live in ordinary preferences.
import {
  isConfirmation,
  sameConfirmation,
  type LanHttpConfirmation,
  type LanHttpConfirmationStore,
} from "./lan-http-confirmations";

export const LAN_HTTP_CONFIRMATIONS_STORAGE_KEY = "fluster.lanHttpConfirmations";

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

  forget(confirmation: LanHttpConfirmation): void {
    const kept = this.memory.filter((stored) => !sameConfirmation(stored, confirmation));
    this.memory.splice(0, this.memory.length, ...kept);
    try {
      const remaining = this.readStorage().filter((stored) => !sameConfirmation(stored, confirmation));
      window.localStorage.setItem(LAN_HTTP_CONFIRMATIONS_STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // Storage is unavailable, so only the in-memory record existed.
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
