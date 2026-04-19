import { defineConfig, globalIgnores } from "eslint/config";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextTypescript,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
