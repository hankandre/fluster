// Import-boundary rules from DOMAINS.md "Dependency rules".
// Composition roots (src/main.tsx, src/app/) and the frozen proof of concept (src/poc/) may import adapters.
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
          "^src/(lib|components|features|app|poc)/|node_modules/(react|react-dom|@jellyfin/sdk|@tauri-apps|axios)/",
      },
    },
    {
      name: "views-use-composition-root",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 3: only the composition root constructs gateways and engines. Receive them via props or context from src/app/compose.ts.",
      from: { path: "^src/(components|features)/", pathNot: tests },
      to: {
        path: "^src/lib/(jellyfin/gateway|player/native-player|player/browser-player)",
      },
    },
    {
      name: "adapters-do-not-import-ui",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 2: adapters never import UI or application code. Pass what the adapter needs in as arguments instead.",
      from: { path: "^src/lib/", pathNot: tests },
      to: {
        path: "^src/(components|features|app|poc)/|node_modules/react/",
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
