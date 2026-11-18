/**
 * #2966 (epic #2872): the permissions each GCP identity must hold, and must
 * not hold, on each bucket, plus the pure comparison against what the Cloud
 * Storage `buckets.testIamPermissions` API reports.
 *
 * HOW TO ADD AN IDENTITY: add an entry to IDENTITY_EXPECTATIONS (B5 media,
 * B6 hosting-deploy) and a job in .github/workflows/gcp-identity-smoke.yml.
 * `granted` is every permission the design gives the identity on the bucket;
 * `denied` is the permissions it must NOT have (they prove a grant is as
 * narrow as designed). A permission never appears in both lists.
 */

export interface BucketExpectation {
  granted: string[]
  denied: string[]
}

export interface IdentityExpectation {
  identity: string
  buckets: Record<string, BucketExpectation>
  /** Read-only listing of soft-deleted copies under one small prefix. */
  softDeletedProbe?: { bucket: string; prefix: string }
}

export interface Mismatch {
  bucket: string
  permission: string
  problem: 'missing-grant' | 'unexpected-grant'
}

export interface Evaluation {
  pass: boolean
  mismatches: Mismatch[]
}

export const PROD_DATA_BUCKET = 'toast-stats-data-ca'
export const STAGING_DATA_BUCKET = 'toast-stats-data-staging'

export const IDENTITY_EXPECTATIONS: Record<string, IdentityExpectation> = {
  // The data auto-restore execute identity (#2964): object access including
  // restore on prod, read on staging, no bucket metadata or IAM anywhere.
  restore: {
    identity: 'restore',
    softDeletedProbe: { bucket: PROD_DATA_BUCKET, prefix: 'v1/latest' },
    buckets: {
      [PROD_DATA_BUCKET]: {
        granted: [
          'storage.objects.list',
          'storage.objects.get',
          'storage.objects.create',
          'storage.objects.delete',
          'storage.objects.restore',
          'storage.objects.update',
        ],
        denied: [
          'storage.buckets.get',
          'storage.buckets.getIamPolicy',
          'storage.buckets.setIamPolicy',
          'storage.buckets.update',
        ],
      },
      [STAGING_DATA_BUCKET]: {
        granted: ['storage.objects.get', 'storage.objects.list'],
        denied: [
          'storage.objects.create',
          'storage.objects.delete',
          'storage.objects.update',
        ],
      },
    },
  },
}

/** Granted then denied, each permission once: what to ask the API about. */
export const permissionsToTest = (b: BucketExpectation): string[] => [
  ...new Set([...b.granted, ...b.denied]),
]

/**
 * Compare the permissions held per bucket (the API's answer) with the
 * expectation, in both directions. A bucket absent from `actualByBucket`
 * holds nothing. Permissions held but not in the expectation are ignored.
 */
export const evaluate = (
  expected: IdentityExpectation,
  actualByBucket: Record<string, string[]>
): Evaluation => {
  const mismatches: Mismatch[] = []
  for (const [bucket, exp] of Object.entries(expected.buckets)) {
    const held = new Set(actualByBucket[bucket] ?? [])
    for (const permission of exp.granted) {
      if (!held.has(permission))
        mismatches.push({ bucket, permission, problem: 'missing-grant' })
    }
    for (const permission of exp.denied) {
      if (held.has(permission))
        mismatches.push({ bucket, permission, problem: 'unexpected-grant' })
    }
  }
  return { pass: mismatches.length === 0, mismatches }
}
