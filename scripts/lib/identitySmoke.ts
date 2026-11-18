/**
 * #2966 (epic #2872): the permissions each GCP identity must hold, and must
 * not hold, on each bucket, plus the pure comparison against what the Cloud
 * Storage `buckets.testIamPermissions` API reports.
 *
 * HOW TO ADD AN IDENTITY: add an entry to IDENTITY_EXPECTATIONS (B6
 * hosting-deploy) and a job in .github/workflows/gcp-identity-smoke.yml.
 * `granted` is every permission the design gives the identity on the bucket;
 * `denied` is the permissions it must NOT have (they prove a grant is as
 * narrow as designed). A permission never appears in both lists.
 */

export interface BucketExpectation {
  granted: string[]
  denied: string[]
}

/**
 * Permissions asked of one object path (objects.testIamPermissions). A grant
 * conditioned on an object-name prefix shows only here, never at bucket level.
 */
export interface ObjectCheck {
  bucket: string
  object: string
  granted: string[]
  denied: string[]
}

export interface IdentityExpectation {
  identity: string
  buckets: Record<string, BucketExpectation>
  objectChecks?: ObjectCheck[]
  /** Read-only listing of soft-deleted copies under one small prefix. */
  softDeletedProbe?: { bucket: string; prefix: string }
}

export interface Mismatch {
  bucket: string
  /** Set for an object-level check; absent for a bucket-level one. */
  object?: string
  permission: string
  problem: 'missing-grant' | 'unexpected-grant'
}

export interface Evaluation {
  pass: boolean
  mismatches: Mismatch[]
}

export const PROD_DATA_BUCKET = 'toast-stats-data-ca'
export const STAGING_DATA_BUCKET = 'toast-stats-data-staging'

// Permissions media must never hold on a data bucket: no delete, no in-place
// update, no restore, and no bucket metadata or IAM (#2972).
const MEDIA_DENIED = [
  'storage.objects.delete',
  'storage.objects.update',
  'storage.objects.restore',
  'storage.buckets.get',
  'storage.buckets.update',
  'storage.buckets.getIamPolicy',
  'storage.buckets.setIamPolicy',
]

// Probe objects for the media identity: one inside the allowed prefixes, one
// outside. objects.testIamPermissions answers 404 for a missing object, so
// both are existing objects in both data buckets (read-only `gcloud storage
// ls`, 2026-11-18). The prefixes are already public in the workflow paths.
const MEDIA_PROBE_INSIDE = 'basemap/protomaps-v4/world-z0-14-20261015.pmtiles'
const MEDIA_PROBE_OUTSIDE = 'v1/latest.json'

export const IDENTITY_EXPECTATIONS: Record<string, IdentityExpectation> = {
  // The video publish and basemap build identity (#2972): create-only under
  // the videos/ and basemap/ prefixes of both data buckets, plus read on the
  // staging prefixes. The grants are conditioned on the object name, so
  // buckets.testIamPermissions cannot show them: the bucket level asserts the
  // denied set only, and objectChecks ask about one path inside the prefixes
  // and one outside. Listing is not asserted: a public read grant on prod can
  // add it. The probes must exist (a 404 fails the smoke closed).
  media: {
    identity: 'media',
    buckets: {
      [PROD_DATA_BUCKET]: { granted: [], denied: MEDIA_DENIED },
      [STAGING_DATA_BUCKET]: { granted: [], denied: MEDIA_DENIED },
    },
    // Media `create` is NOT asserted. Object-level testIamPermissions rejects
    // storage.objects.create with 400 "Invalid argument" (run 44316985025,
    // 2026-11-18), and the bucket-level call cannot see a prefix condition.
    // Create is proven by the first real staging publish; if that fails on
    // create, it is a same-day P1 to the COO, not a retry. Only permissions
    // valid at object level belong here (get, delete, update, IAM policy).
    objectChecks: [
      {
        bucket: PROD_DATA_BUCKET,
        object: MEDIA_PROBE_INSIDE,
        granted: [],
        denied: ['storage.objects.delete', 'storage.objects.update'],
      },
      {
        bucket: PROD_DATA_BUCKET,
        object: MEDIA_PROBE_OUTSIDE,
        granted: [],
        denied: ['storage.objects.delete', 'storage.objects.update'],
      },
      {
        bucket: STAGING_DATA_BUCKET,
        object: MEDIA_PROBE_INSIDE,
        granted: ['storage.objects.get'],
        denied: ['storage.objects.delete', 'storage.objects.update'],
      },
      {
        bucket: STAGING_DATA_BUCKET,
        object: MEDIA_PROBE_OUTSIDE,
        granted: [],
        denied: ['storage.objects.delete', 'storage.objects.update'],
      },
    ],
  },
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
  actualByBucket: Record<string, string[]>,
  actualByObject: Record<string, string[]> = {}
): Evaluation => {
  const mismatches: Mismatch[] = []
  for (const oc of expected.objectChecks ?? []) {
    const held = new Set(actualByObject[`${oc.bucket}/${oc.object}`] ?? [])
    const { bucket, object } = oc
    for (const permission of oc.granted) {
      if (!held.has(permission))
        mismatches.push({
          bucket,
          object,
          permission,
          problem: 'missing-grant',
        })
    }
    for (const permission of oc.denied) {
      if (held.has(permission))
        mismatches.push({
          bucket,
          object,
          permission,
          problem: 'unexpected-grant',
        })
    }
  }
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
