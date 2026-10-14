/**
 * Resolves the smoke target URL (#2010).
 *
 * BASE_URL is required. There is deliberately no default: the old one,
 * `https://staging-toast-stats.web.app`, is the staging site's live channel,
 * which nothing has deployed since 2026-05-25 (only per-PR `pr-<N>` channels
 * are updated), so a run without BASE_URL silently tested a stale build. CI
 * always sets BASE_URL to the PR preview channel URL.
 */
export const BASE_URL_REQUIRED_MESSAGE = [
  'BASE_URL is required to run the Playwright smokes (#2010).',
  'Point it at the build you mean to test, for example:',
  '  prod:          BASE_URL=https://ts.taverns.red npx playwright test',
  '  local build:   npm run build && npx vite preview  (then, in another shell)',
  '                 BASE_URL=http://localhost:4173 npx playwright test',
  '  PR preview:    BASE_URL=<the pr-<N> channel URL from the PR comment>',
].join('\n')

export function resolveBaseUrl(
  env: Record<string, string | undefined>
): string {
  const value = env['BASE_URL']?.trim()
  if (!value) throw new Error(BASE_URL_REQUIRED_MESSAGE)
  return value
}
