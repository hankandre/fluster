import { generateArt } from "../scripts/generate-visual-art.mjs";

// The shared mock server serves generated synthetic art; make sure it exists
// before any e2e journey that uses it (the art folder is gitignored).
export default function globalSetup(): void {
  generateArt();
}
