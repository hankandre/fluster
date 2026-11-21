// Import-boundary rules from DOMAINS.md "Dependency rules", run on packages/core/src (T2-02).
// Test files are exempt from every rule except core-is-platform-free. Tighten these rules; never loosen them.
const tests = "\\.test\\.ts$";
// The core's declared npm packages (packages/core/package.json). Core files may import no other npm package.
const CORE_PACKAGES = ["vitest"];
const ALLOWED = `^packages/core/(src|tests/fixtures)/|(^|node_modules/)(${CORE_PACKAGES.join("|")})(/|$)`;

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
        "DOMAINS.md > Dependency rules 2: the core runs on any host. A core file, tests included, may import only core code, the core's test fixtures, Node builtins (tests only) and the packages in CORE_PACKAGES. Adding a package to CORE_PACKAGES is a reviewed change, allowed only for code that runs on every host, and it must also be a dependency in packages/core/package.json. Take anything else as a constructor argument or a port type, and let the app's composition root supply it.",
      from: { path: "^packages/core/src/" },
      to: { pathNot: ALLOWED, dependencyTypesNot: ["core"] },
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
      name: "core-takes-adapters-by-injection",
      severity: "error",
      comment:
        "DOMAINS.md > Dependency rules 4: only the composition root constructs adapters. Core code outside packages/core/src/adapters takes a Clock or Crypto as a constructor argument and never imports the reference adapters.",
      from: { path: "^packages/core/src/", pathNot: "(^packages/core/src/adapters/|\\.test\\.ts$)" },
      to: { path: "^packages/core/src/adapters/" },
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
  },
};
