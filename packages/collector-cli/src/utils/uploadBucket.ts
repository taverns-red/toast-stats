/**
 * Destination bucket for `collector-cli upload` (#2288).
 *
 * The command used to fall back to the prod bucket when GCS_BUCKET was
 * unset, so a hand run wrote production outside the gated promoter
 * (ADR-015 step 9). It now follows scripts/lib/operatorBucket.ts for a
 * script that writes:
 *   - `--bucket <name>` wins over `GCS_BUCKET`;
 *   - with neither, the command refuses (no silent target, not even
 *     staging, which the pipeline reads from);
 *   - naming prod (`toast-stats-data-ca` or `GCS_BUCKET_PRODUCTION`) needs
 *     `--allow-prod`, so a prod upload is always a deliberate one.
 */

export const PRODUCTION_BUCKET = 'toast-stats-data-ca'
export const STAGING_BUCKET = 'toast-stats-data-staging'

export interface UploadBucketInput {
  /** The `--bucket` option, if given. */
  bucket?: string
  /** Whether `--allow-prod` was passed. */
  allowProd: boolean
  env: Readonly<Record<string, string | undefined>>
}

function bucketName(raw: string): string {
  return raw.replace(/^gs:\/\//, '').replace(/\/+$/, '')
}

function isProduction(bucket: string, env: UploadBucketInput['env']): boolean {
  const prod = env['GCS_BUCKET_PRODUCTION']
  return (
    bucket === PRODUCTION_BUCKET ||
    (prod !== undefined && prod !== '' && bucket === bucketName(prod))
  )
}

/** The bucket to upload to; throws when there is none or it is unconfirmed prod. */
export function resolveUploadBucket({
  bucket,
  allowProd,
  env,
}: UploadBucketInput): string {
  const explicit = bucket || env['GCS_BUCKET'] || undefined
  if (explicit === undefined) {
    throw new Error(
      `No bucket given: pass --bucket <name> or set GCS_BUCKET ` +
        `(staging is ${STAGING_BUCKET}; prod also needs --allow-prod).`
    )
  }

  const name = bucketName(explicit)
  if (isProduction(name, env) && !allowProd) {
    throw new Error(
      `${name} is the production bucket: pass --allow-prod to target it ` +
        `on purpose, or use ${STAGING_BUCKET}.`
    )
  }
  return name
}
