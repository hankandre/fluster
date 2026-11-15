import type { Query, QueryClient } from "@tanstack/react-query";
import type { SessionGateway } from "../app/session";

// Each signed-in gateway gets its own cache scope. Every account-scoped query key puts
// `scopeFor(gateway)` at index 1. Screen data is kept (ACCOUNT_GC_TIME) while its account is the active one,
// so Back finds it again, and is removed by dropOtherAccounts when the account changes or signs out. The
// cache lives only in memory, so closing the app drops it too, and one user's data is never shown to the next.
let nextScope = 0;
const scopes = new WeakMap<SessionGateway, number>();

// Kept until dropOtherAccounts removes it.
export const ACCOUNT_GC_TIME = Number.POSITIVE_INFINITY;

export function scopeFor(gateway: SessionGateway): number {
  let scope = scopes.get(gateway);
  if (scope === undefined) {
    scope = ++nextScope;
    scopes.set(gateway, scope);
  }
  return scope;
}

export function scopeOfKey(key: readonly unknown[]): number | undefined {
  const scope = key[1];
  return typeof scope === "number" ? scope : undefined;
}

// Cancels and removes every query outside the given account's scope: the old account's, unscoped ones, and
// anything a key forgot to scope. Signed out (undefined) removes everything.
export function dropOtherAccounts(queryClient: QueryClient, gateway: SessionGateway | undefined): void {
  const keep = gateway ? scopeFor(gateway) : undefined;
  const predicate = (query: Query) => keep === undefined || scopeOfKey(query.queryKey) !== keep;
  void queryClient.cancelQueries({ predicate });
  queryClient.removeQueries({ predicate });
  queryClient.getMutationCache().clear();
}

const KEPT_KEY_PREFIXES = ["browse", "detail", "search"];

// Marks kept browse, detail, and search data stale. Screens that are open refetch at once, so a change made on
// another client appears; kept screens that are not open only refetch on their next visit, which shows them at once.
export function markAccountDataStale(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (query) => KEPT_KEY_PREFIXES.includes(String(query.queryKey[0])),
    refetchType: "active",
  });
}

// Back (a history traversal) shows kept data at once and refetches it in the background: marks kept Home rows
// and browse, detail, and search data stale, and fetches nothing now. A screen that mounts finds its data
// stale and refetches while showing what it kept. Open screens (the player's detail) are not touched.
export function markKeptDataStaleForReturn(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const head = String(query.queryKey[0]);
      if (head === "home") return query.queryKey[2] !== "views";
      return KEPT_KEY_PREFIXES.includes(head);
    },
    refetchType: "none",
  });
}
