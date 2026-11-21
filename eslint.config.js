// The core must run on any host (DOMAINS.md, Dependency rules 1 and 2): no
// browser globals and no UI or platform framework. Hosts come in through ports.
import parser from "@typescript-eslint/parser";

const platformImports = ["react", "react-*", "react-native", "react-native-*", "@react-native/*", "expo", "expo-*", "@expo/*"];
const hostGlobals = ["window", "document", "localStorage", "sessionStorage", "navigator", "location"];
const useAPort = "The core runs on any host. Take what you need through a port and let the app supply it.";

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
      "no-restricted-globals": ["error", ...hostGlobals.map((name) => ({ name, message: useAPort }))],
      "no-restricted-imports": ["error", { patterns: [{ group: platformImports, message: useAPort }] }],
    },
  },
];
