import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// DOMAINS.md: split files that grow past about 400 lines. The player chrome is
// built from small parts. use-playback-session.ts is outside this task and is
// not measured.
const chromeDir = __dirname;
const componentsDir = join(__dirname, "../../../components");
const MAX_LINES = 400;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const lines = (file: string) => readFileSync(file, "utf8").split("\n").length;

describe("player chrome file size", () => {
  const files = [...sourceFiles(chromeDir), join(componentsDir, "PlayerView.tsx"), join(componentsDir, "player-keymap.ts")];

  for (const file of files) {
    it(`${file.slice(file.indexOf("src/") + 4)} has at most ${MAX_LINES} lines`, () => {
      expect(lines(file)).toBeLessThanOrEqual(MAX_LINES);
    });
  }

  it("has the named parts", () => {
    for (const part of [
      "player-top-bar.tsx",
      "scrubber.tsx",
      "scrub-preview.tsx",
      "transport-controls.tsx",
      "track-panel.tsx",
      "info-sheet.tsx",
      "osd.tsx",
      "player-status.tsx",
      "player-loading.tsx",
      "skip-button.tsx",
      "up-next-card.tsx",
    ]) {
      expect(existsSync(join(chromeDir, part)), part).toBe(true);
    }
  });
});
