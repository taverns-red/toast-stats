import { defineConfig } from 'vitest/config'

/**
 * `npm run test:audio` — generator tests that shell out to ffmpeg (#2336).
 * They are kept out of the default config because main CI and the pre-push
 * hook have no ffmpeg; videos.yml runs them after installing it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.audio.test.ts'],
  },
})
