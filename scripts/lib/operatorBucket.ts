/**
 * Bucket resolution for operator scripts (#2286).
 *
 * The month-end pruning scripts (#140, #152) predate the staging bucket and
 * defaulted to prod, so running one by hand with no arguments read and
 * wrote gs://toast-stats-data-ca outside the gated promoter (ADR-015). Now:
 *   - `--bucket <name>` wins over `GCS_BUCKET`;
 *   - a script that writes refuses to run with neither (no silent target,
 *     not even staging, which the pipeline reads from);
 *   - a read-only script defaults to staging;
 *   - naming prod (`toast-stats-data-ca` or `GCS_BUCKET_PRODUCTION`) needs
 *     `--allow-prod`, so a prod run is always a deliberate one.
 */

import { RAW_CSV_DEFAULT_BUCKET } from './gcsHelpers.js'

export const PRODUCTION_BUCKET = 'toast-stats-data-ca'
export const ALLOW_PROD_FLAG = '--allow-prod'

export interface OperatorBucketInput {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  /** Whether the script can write or delete in the bucket. */
  writes: boolean
}

export interface OperatorBucket {
  bucket: string
  allowProd: boolean
}

function bucketName(raw: string): string {
  return raw.replace(/^gs:\/\//, '').replace(/\/+$/, '')
}

function isProduction(
  bucket: string,
  env: OperatorBucketInput['env']
): boolean {
  const prod = env['GCS_BUCKET_PRODUCTION']
  return (
    bucket === PRODUCTION_BUCKET ||
    (prod !== undefined && prod !== '' && bucket === bucketName(prod))
  )
}

export function resolveOperatorBucket({
  argv,
  env,
  writes,
}: OperatorBucketInput): OperatorBucket {
  const allowProd = argv.includes(ALLOW_PROD_FLAG)
  const i = argv.indexOf('--bucket')
  const fromArg = i === -1 ? undefined : argv[i + 1]
  const explicit = fromArg || env['GCS_BUCKET'] || undefined

  if (explicit === undefined) {
    if (writes) {
      throw new Error(
        `No bucket given: pass --bucket <name> or set GCS_BUCKET ` +
          `(staging is ${RAW_CSV_DEFAULT_BUCKET}; prod also needs ${ALLOW_PROD_FLAG}).`
      )
    }
    return { bucket: RAW_CSV_DEFAULT_BUCKET, allowProd }
  }

  const bucket = bucketName(explicit)
  if (isProduction(bucket, env) && !allowProd) {
    throw new Error(
      `${bucket} is the production bucket: pass ${ALLOW_PROD_FLAG} to ` +
        `target it on purpose, or use ${RAW_CSV_DEFAULT_BUCKET}.`
    )
  }
  return { bucket, allowProd }
}
