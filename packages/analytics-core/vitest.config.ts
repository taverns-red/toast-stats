import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/**/__tests__/**/*.ts',
    ],
    coverage: {
      provider: 'v8',
      // Count every source file, loaded by a test or not (#1536): without an
      // include, vitest only reports files a test imported, so an untested
      // file silently drops out of the denominator. Enforced by
      // `npm run test:coverage:denominator-check`.
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
      thresholds: {
        lines: 85,
        branches: 70,
        functions: 90,
        statements: 85,
      },
    },
    testTimeout: 30000,
  },
})
