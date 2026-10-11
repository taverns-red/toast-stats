import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'scripts/lib/__tests__/**/*.test.ts',
      'scripts/manifests/__tests__/**/*.test.ts',
    ],
    testTimeout: 10000,
  },
})
