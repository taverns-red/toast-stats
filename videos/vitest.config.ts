import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // ffmpeg-backed generator tests run in videos.yml via `npm run
    // test:audio` (vitest.audio.config.ts); main CI has no ffmpeg (#2336).
    exclude: ['**/node_modules/**', 'src/**/__tests__/**/*.audio.test.ts'],
    coverage: {
      provider: 'v8',
      // The denominator is the pure, testable core: scenario configs, their
      // timing rules and the palette. The capture/render CLIs, the music
      // generator and the Remotion components are I/O shells that only run
      // in the opt-in `npm run videos:build` (never in test, pre-push or CI,
      // #2293), so they are excluded by name here, not silently.
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/__tests__/**',
        'src/cli/**',
        'src/capture/**',
        'src/render/**',
        'src/remotion/**',
      ],
      reporter: ['text', 'json'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
})
