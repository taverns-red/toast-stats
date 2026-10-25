/**
 * Bucket resolution for operator scripts (#2286). Placeholder that mirrors
 * today's behaviour (default to prod); the red tests pin the fix.
 */

export const PRODUCTION_BUCKET = 'toast-stats-data-ca'
export const ALLOW_PROD_FLAG = '--allow-prod'

export interface OperatorBucketInput {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  writes: boolean
}

export interface OperatorBucket {
  bucket: string
  allowProd: boolean
}

export function resolveOperatorBucket(
  input: OperatorBucketInput
): OperatorBucket {
  const i = input.argv.indexOf('--bucket')
  const fromArg = i === -1 ? undefined : input.argv[i + 1]
  return {
    bucket: fromArg ?? input.env['GCS_BUCKET'] ?? PRODUCTION_BUCKET,
    allowProd: input.argv.includes(ALLOW_PROD_FLAG),
  }
}
