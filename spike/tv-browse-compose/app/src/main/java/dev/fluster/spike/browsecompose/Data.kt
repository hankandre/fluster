package dev.fluster.spike.browsecompose

// Synthetic catalogue, identical to spike/tv-browse/src/data.ts. Art comes from
// spike/tv-browse/scripts/serve-art.mjs on the host through `adb reverse tcp:8738 tcp:8738`,
// so no host or LAN address is baked into the APK. Port 8738 (not the React Native app's
// 8737) so the two spikes can be measured on one device without sharing a tunnel.
const val ART_BASE = "http://127.0.0.1:8738"
const val ROWS = 20
const val COLS = 50
const val POSTERS = 400
const val BACKDROPS = 60

private val NAMES = listOf("Continue watching", "Latest in Films", "Latest in Shows", "Because you watched", "Favourites")

fun rowTitle(row: Int) = if (row < NAMES.size) NAMES[row] else "Synthetic row ${row + 1}"
// 1000 cards over 400 posters: each poster appears 2-3 times, far apart, so the cache is exercised.
fun posterOf(row: Int, col: Int) = (row * 50 + col) * 7 % POSTERS
fun backdropOf(row: Int, col: Int) = (row * 50 + col) % BACKDROPS
fun titleOf(row: Int, col: Int) = "Synthetic title ${row + 1}·${col + 1}"
fun posterUrl(row: Int, col: Int) = "$ART_BASE/poster/300/${posterOf(row, col)}.jpg"
fun backdropUrl(row: Int, col: Int) = "$ART_BASE/backdrop/1920/${backdropOf(row, col)}.jpg"
