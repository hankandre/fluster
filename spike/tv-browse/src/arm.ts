// Optimisation-pass arms. One APK covers every arm: the arm is fetched at launch from the art
// server's /config.json (FLUSTER_ARM on the host, reached through adb reverse), so the same
// binary is measured with each fix switched on in turn. Missing fields mean "stock".
import { ART_BASE } from "./data";

export type Arm = {
  name: string;
  mvcpOff: boolean; // rows: FlashList maintainVisibleContentPosition disabled
  traps: boolean; // rail trapFocusLeft, Left edge guide to the rail, rail return guide, row-end trap
  rowMemory: boolean; // each row restores its own horizontal offset when its view is recycled
  rgb: boolean; // posters decoded as RGB_565 (expo-image decodeFormat "rgb")
  diskOnly: boolean; // expo-image cachePolicy "disk": no decoded-bitmap memory cache
  backdropW: number; // backdrop variant width requested (1920 = stock)
  crossfadeMs: number; // backdrop crossfade (300 = stock)
  drawDistance: number | undefined; // vertical list drawDistance (undefined = FlashList default)
  rowDrawDistance: number | undefined; // horizontal rows' drawDistance
  rowPool: number | undefined; // rows' maxItemsInRecyclePool
  plainLift: boolean; // focus lift without Reanimated: a static focused style set from onFocus
};

export const STOCK: Arm = {
  name: "stock",
  mvcpOff: false,
  traps: false,
  rowMemory: false,
  rgb: false,
  diskOnly: false,
  backdropW: 1920,
  crossfadeMs: 300,
  drawDistance: undefined,
  rowDrawDistance: undefined,
  rowPool: undefined,
  plainLift: false,
};

export let ARM: Arm = STOCK;

export async function loadArm(): Promise<Arm> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${ART_BASE}/config.json`, { signal: ctrl.signal });
    clearTimeout(t);
    ARM = { ...STOCK, ...(await res.json()) };
  } catch {
    ARM = { ...STOCK, name: "stock (no config)" };
  }
  return ARM;
}
