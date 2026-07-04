import js from "@eslint/js";
import n from "eslint-plugin-n";
import noSecrets from "eslint-plugin-no-secrets";
import security from "eslint-plugin-security";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "docs/assets/screenshots/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        AbortSignal: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        structuredClone: "readonly",
        URL: "readonly",
      },
    },
    plugins: {
      n,
      "no-secrets": noSecrets,
      security,
    },
    rules: {
      "n/no-missing-import": "error",
      "security/detect-bidi-characters": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-unsafe-regex": "error",
      "no-secrets/no-secrets": [
        "error",
        {
          tolerance: 4.8,
          ignoreContent: [
            "forward-kentik",
            "kentik-key",
            "sha256",
            "NewNetworkCheck",
            "topXdata"
          ],
        },
      ],
    },
  },
];
