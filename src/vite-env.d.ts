/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Set only by the e2e dev server (playwright.config.ts) to "fake-hls".
  readonly VITE_FLUSTER_E2E_ENGINE?: string;
}

// The app version from package.json, set by vite.config.ts and vitest.config.ts.
declare const __APP_VERSION__: string;
