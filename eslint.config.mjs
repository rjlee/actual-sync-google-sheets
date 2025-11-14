import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: [
      "src/**/*.{js,mjs,cjs}",
      "tests/**/*.{js,mjs,cjs}",
      "jest.config.js",
      "release.config.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      sourceType: "commonjs",
      ecmaVersion: 2022,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "script",
      },
    },
  },
  {
    files: ["tests/**/*.test.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  },
  {
    rules: {
      "no-console": "off",
    },
  },
];
