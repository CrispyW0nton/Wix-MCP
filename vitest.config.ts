import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "packages/**/__tests__/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
    },
    pool: "forks",
  },
  resolve: {
    alias: {
      "@wix-mcp/shared-types": new URL(
        "./packages/shared-types/src/index.ts",
        import.meta.url,
      ).pathname,
      "@wix-mcp/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@wix-mcp/config": new URL("./packages/config/src/index.ts", import.meta.url).pathname,
      "@wix-mcp/wix-auth": new URL("./packages/wix-auth/src/index.ts", import.meta.url)
        .pathname,
      "@wix-mcp/wix-clients": new URL(
        "./packages/wix-clients/src/index.ts",
        import.meta.url,
      ).pathname,
      "@wix-mcp/capability-registry": new URL(
        "./packages/capability-registry/src/index.ts",
        import.meta.url,
      ).pathname,
      "@wix-mcp/audit": new URL("./packages/audit/src/index.ts", import.meta.url).pathname,
      "@wix-mcp/tool-definitions": new URL(
        "./packages/tool-definitions/src/index.ts",
        import.meta.url,
      ).pathname,
      "@wix-mcp/executors": new URL("./packages/executors/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
