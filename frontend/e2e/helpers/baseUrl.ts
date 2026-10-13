/** Resolves the smoke target URL (#2010). */
export function resolveBaseUrl(
  env: Record<string, string | undefined>
): string {
  return env['BASE_URL'] || 'https://staging-toast-stats.web.app'
}
