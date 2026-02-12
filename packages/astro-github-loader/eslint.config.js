import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
    },
    rules: {
      "no-console": "warn",
    },
  },
  {
    files: ["src/github.logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "test-output/"],
  },
];
