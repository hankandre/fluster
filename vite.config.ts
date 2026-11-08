import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// Only the e2e dev server may select the test engine. A build with the flag,
// from the shell or a .env file, would ship it in place of the real engine.
export function assertNoTestEngine(command: string, mode: string): void {
  if (command !== "build") return;
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  if (env.VITE_FLUSTER_E2E_ENGINE) {
    throw new Error("VITE_FLUSTER_E2E_ENGINE is set: refusing to build with the test-only player engine.");
  }
}

export default defineConfig(({ command, mode }) => {
  assertNoTestEngine(command, mode);
  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || "127.0.0.1",
      hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
  };
});
