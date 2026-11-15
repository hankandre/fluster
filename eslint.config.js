// Hooks rules only, per D2 A; see docs/specs/P0-16.md.
import parser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser },
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
