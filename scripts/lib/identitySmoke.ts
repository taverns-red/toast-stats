// Stub for the red commit (#2966): real implementation follows.
export interface BucketExpectation {
  granted: string[]
  denied: string[]
}
export interface IdentityExpectation {
  identity: string
  buckets: Record<string, BucketExpectation>
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

export const IDENTITY_EXPECTATIONS: Record<string, IdentityExpectation> = {
  restore: { identity: 'restore', buckets: {} },
}

export const permissionsToTest = (_b: BucketExpectation): string[] => []

export const evaluate = (
  _expected: IdentityExpectation,
  _actual: Record<string, string[]>
): Evaluation => ({ pass: true, mismatches: [] })
