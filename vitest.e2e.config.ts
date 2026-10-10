import { defineConfig } from 'vitest/config'

// `npm run test:e2e`: the real Electron app, one file at a time, with room for slow launches.
export default defineConfig({
  test: { include: ['e2e/**/*.e2e.ts'], testTimeout: 60_000, hookTimeout: 90_000, fileParallelism: false },
})
