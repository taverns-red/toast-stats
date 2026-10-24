import { defineConfig, devices } from '@playwright/test'
import { resolveBaseUrl } from './e2e/helpers/baseUrl'

/**
 * Smoke test configuration for staging environment (#316)
 *
 * Runs against the URL in BASE_URL, which is required (#2010): a PR preview
 * channel (what CI sets), prod (https://ts.taverns.red), or a local
 * `vite preview` (http://localhost:4173). There is no default; the old one was
 * the staging site's live channel, a stale May 2026 build.
 *
 * Two engines (#710): `smoke` runs in Chromium (default), `webkit` runs in
 * WebKit/Safari. #685 verified contrast in Chromium-at-rest only and missed
 * a Safari-visible regression; running smokes in WebKit too closes that
 * blind spot. Run one engine with `--project=webkit`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: resolveBaseUrl(process.env),
    headless: true,
    screenshot: 'only-on-failure',
    // A trace of the retry, for the failure artifact the preview job uploads
    // (#2248). Recorded only when a test is retried, so a green run pays
    // nothing.
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: '**/*.smoke.ts',
    },
    {
      name: 'webkit',
      testMatch: '**/*.smoke.ts',
      use: { ...devices['Desktop Safari'] },
    },
  ],
})
