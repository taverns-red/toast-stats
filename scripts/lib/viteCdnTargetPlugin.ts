/**
 * Vite build check for the CDN target (#2994).
 *
 * Without it a CI bundle could ship pointing at the prod CDN without anyone
 * saying so: the source falls back to prod when `VITE_CDN_BASE_URL` is
 * unset. This applies the OG-stub step's rules (resolveBuildCdnTarget:
 * CI must name a target, a malformed URL always fails, local builds get a
 * logged prod default) to `vite build`.
 *
 * It reads the process env it is given (vite.config.ts passes
 * `process.env`), never values Vite loads from .env files, so a file can't
 * hide a missing target. `apply: 'build'` keeps it out of dev and vitest.
 */

import { resolveBuildCdnTarget } from './cdnTarget.js'

export interface CdnTargetPlugin {
  name: string
  apply: 'build'
  buildStart: () => void
}

export function cdnTargetPlugin(
  env: Record<string, string | undefined>,
  prodUrl: string
): CdnTargetPlugin {
  return {
    name: 'cdn-target-check',
    apply: 'build',
    buildStart() {
      const { url, source } = resolveBuildCdnTarget('vite build', env, prodUrl)
      if (source === 'local-default') {
        console.error(
          `[cdn-target] VITE_CDN_BASE_URL is not set; the bundle uses the prod CDN ${url} (local build). CI must set it.`
        )
      }
    },
  }
}
