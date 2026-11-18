/**
 * #2966: the expected granted and denied permission sets per GCP identity, and
 * the pure comparison the identity smoke runs against what the Cloud Storage
 * testIamPermissions API reports.
 */
import { describe, it, expect } from 'vitest'
import {
  IDENTITY_EXPECTATIONS,
  evaluate,
  permissionsToTest,
  type IdentityExpectation,
} from '../identitySmoke'

const sample: IdentityExpectation = {
  identity: 'sample',
  buckets: {
    'bucket-a': {
      granted: ['storage.objects.get', 'storage.objects.list'],
      denied: ['storage.buckets.get'],
    },
    'bucket-b': { granted: [], denied: ['storage.objects.create'] },
  },
}

describe('evaluate (#2966)', () => {
  it('passes when every granted permission is held and no denied one is', () => {
    const result = evaluate(sample, {
      'bucket-a': ['storage.objects.get', 'storage.objects.list'],
      'bucket-b': [],
    })
    expect(result).toEqual({ pass: true, mismatches: [] })
  })

  it('fails and names a granted permission that is missing', () => {
    const result = evaluate(sample, {
      'bucket-a': ['storage.objects.get'],
      'bucket-b': [],
    })
    expect(result.pass).toBe(false)
    expect(result.mismatches).toEqual([
      {
        bucket: 'bucket-a',
        permission: 'storage.objects.list',
        problem: 'missing-grant',
      },
    ])
  })

  it('fails and names a denied permission that is held', () => {
    const result = evaluate(sample, {
      'bucket-a': [
        'storage.objects.get',
        'storage.objects.list',
        'storage.buckets.get',
      ],
      'bucket-b': [],
    })
    expect(result.pass).toBe(false)
    expect(result.mismatches).toEqual([
      {
        bucket: 'bucket-a',
        permission: 'storage.buckets.get',
        problem: 'unexpected-grant',
      },
    ])
  })

  it('reports both directions at once, across buckets', () => {
    const result = evaluate(sample, {
      'bucket-a': [],
      'bucket-b': ['storage.objects.create'],
    })
    expect(result.pass).toBe(false)
    expect(result.mismatches).toHaveLength(3)
  })

  it('treats a bucket missing from the answer as holding nothing', () => {
    const result = evaluate(sample, { 'bucket-b': [] })
    expect(result.pass).toBe(false)
    expect(result.mismatches.map(m => m.problem)).toEqual([
      'missing-grant',
      'missing-grant',
    ])
  })

  it('ignores permissions that are held but not part of the expectation', () => {
    const result = evaluate(sample, {
      'bucket-a': [
        'storage.objects.get',
        'storage.objects.list',
        'storage.objects.update',
      ],
      'bucket-b': [],
    })
    expect(result.pass).toBe(true)
  })
})

describe('permissionsToTest (#2966)', () => {
  it('returns granted and denied together, without duplicates', () => {
    expect(
      permissionsToTest({
        granted: ['a', 'b'],
        denied: ['b', 'c'],
      })
    ).toEqual(['a', 'b', 'c'])
  })
})

describe('restore identity expectation (#2966)', () => {
  const restore = IDENTITY_EXPECTATIONS['restore']!

  it('is keyed by its own name', () => {
    expect(restore.identity).toBe('restore')
  })

  it('grants object access including restore on the prod bucket', () => {
    expect(restore.buckets['toast-stats-data-ca']!.granted.sort()).toEqual([
      'storage.objects.create',
      'storage.objects.delete',
      'storage.objects.get',
      'storage.objects.list',
      'storage.objects.restore',
      'storage.objects.update',
    ])
  })

  it('denies bucket metadata and the bucket IAM policy on the prod bucket', () => {
    const denied = restore.buckets['toast-stats-data-ca']!.denied
    expect(denied).toContain('storage.buckets.get')
    expect(denied).toContain('storage.buckets.getIamPolicy')
    expect(denied).toContain('storage.buckets.setIamPolicy')
    expect(denied).toContain('storage.buckets.update')
  })

  it('reads staging and cannot write there', () => {
    const staging = restore.buckets['toast-stats-data-staging']!
    expect(staging.granted.sort()).toEqual([
      'storage.objects.get',
      'storage.objects.list',
    ])
    expect(staging.denied).toContain('storage.objects.create')
    expect(staging.denied).toContain('storage.objects.delete')
    expect(staging.denied).toContain('storage.objects.update')
  })

  it('probes soft-deleted copies under one small prod prefix', () => {
    expect(restore.softDeletedProbe).toEqual({
      bucket: 'toast-stats-data-ca',
      prefix: 'v1/latest',
    })
  })

  it('never lists a permission as both granted and denied', () => {
    for (const b of Object.values(restore.buckets)) {
      expect(b.granted.filter(p => b.denied.includes(p))).toEqual([])
    }
  })
})

describe('media identity expectation (#2972)', () => {
  const media = IDENTITY_EXPECTATIONS['media']!

  it('is keyed by its own name', () => {
    expect(media.identity).toBe('media')
  })

  it('creates on both data buckets, and reads on staging only', () => {
    expect(media.buckets['toast-stats-data-ca']!.granted).toEqual([
      'storage.objects.create',
    ])
    expect(media.buckets['toast-stats-data-staging']!.granted.sort()).toEqual([
      'storage.objects.create',
      'storage.objects.get',
    ])
  })

  it('can never delete, overwrite in place, restore or change bucket metadata or IAM', () => {
    for (const b of Object.values(media.buckets)) {
      for (const p of [
        'storage.objects.delete',
        'storage.objects.update',
        'storage.objects.restore',
        'storage.buckets.update',
        'storage.buckets.setIamPolicy',
      ])
        expect(b.denied).toContain(p)
    }
  })

  it('never lists a permission as both granted and denied', () => {
    for (const b of Object.values(media.buckets)) {
      expect(b.granted.filter(p => b.denied.includes(p))).toEqual([])
    }
  })
})
