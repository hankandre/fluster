// Import-boundary rules from DOMAINS.md "Dependency rules".
// Test files are exempt from every rule.
const tests = "\\.test\\.ts$";

module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 1: src/domain imports nothing outside itself. Move I/O to an adapter (src/lib/...) and pass data in.",
      from: { path: "^src/domain/", pathNot: tests },
      to: {
        path: "^src/lib/|node_modules/(react|react-native|expo|@expo|@jellyfin/sdk|axios)/",
      },
    },
    {
      name: "core-is-platform-free",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 2: the core runs on any host. It must not import React, React Native, Expo, or a native module. Take what you need as a constructor argument or a port type, and let the app's composition root supply it.",
      from: { path: "^src/", pathNot: tests },
      to: {
        path: "node_modules/(react|react-dom|react-native|expo|@expo|@react-native|@tanstack)/|^(apps|modules)/",
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
    tsConfig: { fileName: "tsconfig.json" },
    // Check type-only imports too; domain types must not depend on the SDK.
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: tests },
  },
};
