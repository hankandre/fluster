// Import-boundary rules from DOMAINS.md "Dependency rules".
// Composition roots (src/main.tsx, src/app/) may import adapters.
// Test files are exempt from every rule.
const tests = "\\.test\\.tsx?$|^src/test/";

module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 1: src/domain imports nothing outside itself. Move I/O to an adapter (src/lib/...) and pass data in.",
      from: { path: "^src/domain/", pathNot: tests },
      to: {
        path:
          "^src/(lib|components|features|app)/|node_modules/(react|react-dom|@jellyfin/sdk|@tauri-apps|axios)/",
      },
    },
    {
      name: "core-is-shell-neutral",
      severity: "error",
      comment:
        "The shell-neutral core (src/domain, src/lib/jellyfin, the playback coordinator, the playstate reporter, the preference and streaming-limit ports) is shared with future non-Tauri shells (docs/plans/active/002, P12-01). It must not import Tauri, React, react-query, or any browser or desktop adapter. Take what you need as a constructor argument or a port type and wire the adapter in src/app/compose.ts. DOM globals such as window or document are caught by `pnpm typecheck:core`.",
      from: {
        path: "^src/(domain/|lib/jellyfin/|lib/(preference-store|streaming-limits)\\.ts$|lib/player/(coordinator|playstate-reporter|session-state)\\.ts$)",
        pathNot: tests,
      },
      to: {
        path:
          "node_modules/(react|react-dom|@tanstack|@tauri-apps)/|^src/(components|features|app)/|^src/lib/(player/(browser-player|native-player)|realtime/|discovery/|install-id|browser-)",
      },
    },
    {
      name: "views-use-composition-root",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 3: only the composition root constructs gateways and engines. Receive them via props or context from src/app/compose.ts.",
      from: { path: "^src/(components|features)/", pathNot: tests },
      to: {
        path: "^src/lib/(jellyfin/gateway|player/native-player|player/browser-player|realtime/|discovery/)",
      },
    },
    {
      name: "adapters-do-not-import-ui",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 2: adapters never import UI or application code. Pass what the adapter needs in as arguments instead.",
      from: { path: "^src/lib/", pathNot: tests },
      to: {
        path: "^src/(components|features|app)/|node_modules/react/",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular imports hide layering mistakes. Extract the shared piece into a lower layer.",
      from: { pathNot: tests },
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.app.json" },
    // Check type-only imports too; domain types must not depend on the SDK.
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: tests },
  },
};
