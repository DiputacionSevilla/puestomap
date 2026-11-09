import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@puestomap/shared/probe": path.resolve("packages/shared/src/probe.ts"),
      "@puestomap/shared/crypto": path.resolve("packages/shared/src/crypto.ts"),
      "@puestomap/shared/token": path.resolve("packages/shared/src/token.ts"),
      "@puestomap/shared": path.resolve("packages/shared/src/index.ts"),
      "@puestomap/db": path.resolve("packages/db/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts", "apps/*/src/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
});
