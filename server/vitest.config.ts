import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node env is fine — no browser APIs in server code except `crypto.randomUUID`
    // which Node 22 provides globally, and `fetch` which is also global.
    environment: 'node',
    // Every test file must be deterministic; no live LLM/Amap calls.
    // If a test somehow reaches the network, fail fast.
    testTimeout: 10_000,
    include: ['src/**/*.test.ts'],
    // Coverage is opt-in; run with `--coverage` when needed.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/node_modules/**', '**/*.test.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    // Server uses NodeNext + `.js` import specifiers; Vitest needs the
    // TS files under those specifiers to resolve during testing.
    conditions: ['node'],
  },
})
