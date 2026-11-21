// Import-boundary rules from DOMAINS.md "Dependency rules", run on packages/core/src (T2-02).
// Test files are exempt from every rule. Tighten these rules; never loosen them.
const tests = "\\.test\\.ts$";

module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 1: packages/core/src/domain imports nothing outside itself: no other core folder, no npm package and no Node builtin, resolved or not. Move I/O to an adapter (packages/core/src/jellyfin/...) and pass data in.",
      from: { path: "^packages/core/src/domain/", pathNot: tests },
      to: { pathNot: "^packages/core/src/domain/" },
    },
    {
      name: "core-is-platform-free",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 2: the core runs on any host. It must not import React, React Native, Expo, or a native module, installed or not. Take what you need as a constructor argument or a port type, and let the app's composition root supply it.",
      from: { path: "^packages/core/src/", pathNot: tests },
      to: {
        path: "(^|node_modules/)(react|react-dom|react-native|react-native-[^/]+|expo|expo-[^/]+|@expo/[^/]+|@react-native/[^/]+|@react-native-[^/]+/[^/]+|@tanstack/[^/]+)(/|$)|^(apps|modules)/",
      },
    },
    {
      name: "core-has-no-host-builtins",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 2: the core must not import a Node, browser or desktop API. Take it through a port. ESLint's no-restricted-globals covers the host globals.",
      from: { path: "^packages/core/src/", pathNot: tests },
      to: { dependencyTypes: ["core"] },
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
