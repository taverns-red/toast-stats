/**
 * Explicit CDN target for the scripts that read the published data (#2974).
 *
 * These scripts used to fall back to the production CDN when no target was
 * given. A check meant for staging then reported on prod and could say
 * "healthy" for the wrong target (#2492 drill). They now refuse to run
 * without one. No I/O here beyond what the caller passes in.
 */

export class MissingCdnTargetError extends Error {
  constructor(script: string) {
    super(
      `${script} requires an explicit CDN target: set CDN_BASE_URL ` +
        `(or pass --base URL where supported). It no longer defaults to ` +
        `the production CDN.`
    )
    this.name = 'MissingCdnTargetError'
  }
}

/** Trimmed base URL without a trailing slash, or throws if none is given. */
export function requireCdnTarget(
  script: string,
  env: Record<string, string | undefined>,
  flagValue?: string
): string {
  // An empty --base counts as not given, so it cannot hide a valid env value.
  const flag = (flagValue ?? '').trim()
  const raw = flag !== '' ? flag : (env['CDN_BASE_URL'] ?? '').trim()
  if (raw === '') throw new MissingCdnTargetError(script)
  return raw.replace(/\/+$/, '')
}

/** For CLI entry points: the target, or a stderr message and exit code 2. */
export function cdnTargetOrExit(
  script: string,
  env: Record<string, string | undefined>,
  flagValue?: string
): string {
  try {
    return requireCdnTarget(script, env, flagValue)
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    process.exit(2)
  }
}

/**
 * For CLI entry points: a required URL env var (BASE_URL, MANIFEST_URL), or
 * a stderr message and exit code 2. No default, for the same reason as the
 * CDN target.
 */
export function requireEnvUrlOrExit(
  script: string,
  name: string,
  env: Record<string, string | undefined>
): string {
  const raw = (env[name] ?? '').trim()
  if (raw === '') {
    process.stderr.write(
      `${script} requires ${name} to be set to the URL to check. ` +
        `It no longer defaults to production.\n`
    )
    process.exit(2)
  }
  return raw
}

/**
 * A set but malformed target is a typo, not a missing value, so it fails
 * in CI and locally alike (#2987).
 */
function assertHttpUrl(script: string, raw: string): void {
  let ok = false
  try {
    const u = new URL(raw)
    ok = (u.protocol === 'http:' || u.protocol === 'https:') && u.host !== ''
  } catch {
    ok = false
  }
  if (!ok) {
    throw new Error(
      `${script}: VITE_CDN_BASE_URL must be an absolute http(s) URL, got ` +
        `"${raw}".`
    )
  }
}

/** Where the build's CDN target came from. */
export type BuildCdnSource = 'env' | 'local-default'

/**
 * CDN target for the frontend build (#2982): `VITE_CDN_BASE_URL`.
 *
 * A CI build (any `CI` value but empty, `false` or `0`) must name its target: a staging or preview build
 * that left it out would write OG stubs from prod data. A local
 * `npm run build:frontend` keeps working for contributors: with no target
 * it falls back to the prod CDN, and `source: 'local-default'` lets the
 * caller say so on stderr.
 */
export function resolveBuildCdnTarget(
  script: string,
  env: Record<string, string | undefined>,
  prodUrl: string
): { url: string; source: BuildCdnSource } {
  const raw = (env['VITE_CDN_BASE_URL'] ?? '').trim()
  if (raw !== '') {
    assertHttpUrl(script, raw)
    return { url: raw.replace(/\/+$/, ''), source: 'env' }
  }
  // Fail closed: any non-empty CI value counts, except an explicit off.
  const ci = (env['CI'] ?? '').trim().toLowerCase()
  if (ci !== '' && ci !== 'false' && ci !== '0') {
    throw new Error(
      `${script} requires an explicit CDN target in CI: set ` +
        `VITE_CDN_BASE_URL on the build step (staging for previews, ` +
        `${prodUrl} for production). It no longer defaults to the ` +
        `production CDN in CI.`
    )
  }
  return { url: prodUrl, source: 'local-default' }
}

/**
 * The CDN the frontend bundle reads from (#3000): the value Vite loaded for
 * `VITE_CDN_BASE_URL` (process env first, then .env files), trimmed and
 * without trailing slashes, or prod when it is empty or only whitespace.
 * vite.config.ts bakes this into the bundle as `__CDN_BASE_URL__` and the
 * build plugin logs the same value, so the two cannot disagree.
 */
export function bundleCdnBaseUrl(
  value: string | undefined,
  prodUrl: string
): string {
  const trimmed = (value ?? '').trim().replace(/\/+$/, '')
  return trimmed === '' ? prodUrl : trimmed
}

/** The prod CDN origin; the one place outside the CDN itself that names it. */
export const PROD_CDN_BASE_URL = 'https://cdn.taverns.red'
