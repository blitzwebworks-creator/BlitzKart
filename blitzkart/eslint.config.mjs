import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const config = [
  { ignores: [".next/**", "build-output*/**", "coverage/**", "node_modules/**", ".npm-runtime/**", ".pnpm10-store/**", ".pnpm-virtual-store/**", "next-env.d.ts", "package-lock.json"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
];

export default config;
