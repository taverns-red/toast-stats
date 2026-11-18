/**
 * The one place the frontend names the prod CDN (#2994).
 *
 * `VITE_CDN_BASE_URL` picks the CDN at build time (prod, or staging for PR
 * previews). When it is unset the bundle falls back to prod, which dev and
 * vitest rely on. A CI build can't get there quietly: the `cdn-target-check`
 * plugin in vite.config.ts fails `vite build` in CI when it is unset.
 */

export const PROD_CDN_BASE_URL = 'https://cdn.taverns.red'

export function cdnBaseUrlFromEnv(): string {
  return import.meta.env['VITE_CDN_BASE_URL'] || PROD_CDN_BASE_URL
}
