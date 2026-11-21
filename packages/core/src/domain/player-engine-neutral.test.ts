// T2-05 acceptance item 1: the port has no surface-geometry or fullscreen method and no mpv name in its types.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLAYER_ENGINE_METHODS } from "./player-engine";

const here = dirname(fileURLToPath(import.meta.url));
const portSource = readFileSync(join(here, "player-engine.ts"), "utf8");
const playbackSource = readFileSync(join(here, "playback.ts"), "utf8");

// Desktop-era and mpv words. Comments count: the port's file must not name them at all.
const FORBIDDEN =
  /mpv|hwdec|surface|fullscreen|gpu[-_ ]?context|video[-_ ]?output|\bvo\b|renderer|embedded|browser|scale[-_ ]?factor/i;

describe("the PlayerEngine port file", () => {
  it("is the file that declares the port", () => {
    expect(portSource.trim().length).toBeGreaterThan(0);
    expect(portSource).toMatch(/\binterface PlayerEngine\b/);
  });

  it("imports nothing", () => {
    expect(portSource).not.toMatch(/^\s*import\b/m);
    expect(portSource).not.toMatch(/\bimport\s*\(/);
    expect(portSource).not.toMatch(/\brequire\s*\(/);
    expect(portSource).not.toMatch(/^\s*export\s+(\*|\{[^}]*\})\s+from\b/m);
  });

  it("names no surface, fullscreen, renderer, browser or mpv term, comments included", () => {
    // The pattern is live: it catches the members and fields this task removes.
    for (const old of ["setSurface", "setFullscreen", "libmpvVersion", "nativeRenderer", "hwdecCurrent", "gpuContext", "videoOutput", "scaleFactor", 'mode: "native" | "browser"']) {
      expect(old).toMatch(FORBIDDEN);
    }
    const hits = portSource.split("\n").filter((line) => FORBIDDEN.test(line));
    expect(hits).toEqual([]);
  });

  it("has no surface, fullscreen, volume or mute command", () => {
    const methods: readonly string[] = PLAYER_ENGINE_METHODS;
    for (const removed of ["setSurface", "setFullscreen", "setVolume", "setMuted"]) {
      expect(methods).not.toContain(removed);
    }
  });
});

describe("domain/playback.ts after the move", () => {
  it("declares none of the port's old names and re-exports the port from player-engine", () => {
    expect(playbackSource).not.toMatch(/\binterface PlayerEngine\b/);
    expect(playbackSource).not.toMatch(/\binterface PlayerCapabilities\b/);
    expect(playbackSource).not.toContain("PlayerSurfaceFrame");
    expect(playbackSource).not.toContain("LaunchAuthorization");
    expect(playbackSource).not.toContain("UnsupportedDeliveryError");
    expect(playbackSource).toMatch(/\bfrom\s+["']\.\/player-engine["']/);
  });

  it("names no mpv term", () => {
    const hits = playbackSource.split("\n").filter((line) => /mpv|hwdec/i.test(line));
    expect(hits).toEqual([]);
  });
});
