// Synthetic catalogue. Art comes from scripts/serve-art.mjs on the host, reached through
// `adb reverse tcp:8737 tcp:8737`, so no host or LAN address is baked into the APK.
export const ART_BASE = "http://127.0.0.1:8737";
export const ROWS = 20;
export const COLS = 50;
export const POSTERS = 400;
export const BACKDROPS = 60;

const NAMES = ["Continue watching", "Latest in Films", "Latest in Shows", "Because you watched", "Favourites"];

export const rowTitle = (row: number) => (row < NAMES.length ? NAMES[row] : `Synthetic row ${row + 1}`);
// 1000 cards over 400 posters: each poster appears 2-3 times, far apart, so the cache is exercised.
export const posterOf = (row: number, col: number) => (row * 50 + col) * 7 % POSTERS;
export const backdropOf = (row: number, col: number) => (row * 50 + col) % BACKDROPS;
export const titleOf = (row: number, col: number) => `Synthetic title ${row + 1}·${col + 1}`;
