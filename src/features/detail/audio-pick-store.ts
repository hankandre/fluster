import { parseItemRoute, parsePlayRoute, ROUTE_REPLACED_EVENT } from "../routes";

// The audio track the viewer picked on a title's page (P17-08, L8 A). It lives in this module variable only:
// never in the account, the P3-22 store, WebView storage, a query cache, or history.state. It is forgotten the
// moment the route is neither the title's page nor its player, so it never reaches another title.
export interface HeldAudioPick {
  scope: number;
  itemId: string;
  mediaSourceId: string;
  audioStreamIndex: number;
}

let held: HeldAudioPick | undefined;
let listening = false;

function onRouteChange(): void {
  if (!held) return;
  const hash = window.location.hash;
  if (parseItemRoute(hash) === held.itemId || parsePlayRoute(hash)?.itemId === held.itemId) return;
  held = undefined;
}

export function holdAudioPick(pick: HeldAudioPick): void {
  held = pick;
  if (listening) return;
  listening = true;
  window.addEventListener("hashchange", onRouteChange);
  window.addEventListener(ROUTE_REPLACED_EVENT, onRouteChange);
}

export function heldAudioPick(scope: number, itemId: string): HeldAudioPick | undefined {
  return held && held.scope === scope && held.itemId === itemId ? held : undefined;
}

export function forgetAudioPick(): void {
  held = undefined;
}
