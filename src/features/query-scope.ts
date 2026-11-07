import type { SessionGateway } from "../app/session";

// Each signed-in gateway gets its own cache scope. Views use it in query keys
// and drop their queries on unmount (gcTime 0), so one user's data is never
// shown to the next.
let nextScope = 0;
const scopes = new WeakMap<SessionGateway, number>();

export function scopeFor(gateway: SessionGateway): number {
  let scope = scopes.get(gateway);
  if (scope === undefined) {
    scope = ++nextScope;
    scopes.set(gateway, scope);
  }
  return scope;
}
