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
  const raw = (flagValue ?? env['CDN_BASE_URL'] ?? '').trim()
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
