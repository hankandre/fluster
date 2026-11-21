// The core must run on any host (DOMAINS.md, Dependency rules 1 and 2): no
// browser globals and no UI or platform framework. Hosts come in through ports.
// Time and randomness come only from the Clock and Crypto ports; only the
// reference adapters in packages/core/src/adapters/ may touch the host's
// timers, wall clock and crypto (T2-03), and only they may call fetch (T2-04).
import parser from "@typescript-eslint/parser";

const platformImports = ["react", "react-*", "react-native", "react-native-*", "@react-native/*", "expo", "expo-*", "@expo/*"];
const hostGlobals = ["window", "document", "localStorage", "sessionStorage", "navigator", "location"];
const takeTime = "Take time from the injected Clock (packages/core/src/ports/clock.ts).";
const takeCrypto = "Take hashing and random ids from the injected Crypto (packages/core/src/ports/crypto.ts).";
const useTransport = "Reach the server through the injected Transport (packages/core/src/ports/transport.ts).";
const useAPort = "The core runs on any host. Take what you need through a port and let the app supply it.";

const browserGlobals = hostGlobals.map((name) => ({ name, message: useAPort }));
const clockGlobals = ["setTimeout", "clearTimeout", "setInterval", "clearInterval"];

export default [
  {
    files: ["packages/core/src/**/*.ts"],
    languageOptions: { parser },
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: platformImports, message: useAPort }] }],
    },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts", "packages/core/src/adapters/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...browserGlobals,
        ...clockGlobals.map((name) => ({ name, message: takeTime })),
        { name: "crypto", message: takeCrypto },
        { name: "fetch", message: useTransport },
        { name: "XMLHttpRequest", message: useTransport },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: takeTime },
        { object: "Math", property: "random", message: takeCrypto },
        ...clockGlobals.map((property) => ({ object: "globalThis", property, message: takeTime })),
        { object: "globalThis", property: "crypto", message: takeCrypto },
        { object: "globalThis", property: "fetch", message: useTransport },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: takeTime },
        { selector: "CallExpression[callee.name='Date']", message: takeTime },
      ],
    },
  },
  {
    files: ["packages/core/src/adapters/**/*.ts"],
    ignores: ["packages/core/src/**/*.test.ts"],
    rules: {
      "no-restricted-globals": ["error", ...browserGlobals],
    },
  },
];
