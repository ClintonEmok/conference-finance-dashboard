import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Dedicated config for convex-test handler-level tests. These must run in
// the edge-runtime environment (convex-test needs a full edge runtime to
// execute Convex functions), which is incompatible with the node-environment
// unit tests in vitest.config.ts.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
})
