import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateArt } from "../../scripts/generate-visual-art.mjs";

export default function globalSetup(): void {
  generateArt();
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  rmSync(join(root, "visual-captures"), { recursive: true, force: true });
  rmSync(join(root, "test-results", "contrast"), { recursive: true, force: true });
}
