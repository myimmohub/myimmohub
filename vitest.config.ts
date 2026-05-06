import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts", "packages/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    environment: "node",
    globals: false,
    reporters: ["default"],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
