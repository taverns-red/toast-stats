/**
 * The contact strip never deletes a required key, validates each rewrite
 * against its contract, and repairs reports files it already broke (#2097).
 *
 * Strip run 38791756094 (#2075) scrubbed `location` in reports files with
 * the FAC scrubber, which returns `undefined` for a place that is only an
 * email, and so deleted the key. `location` is required by the reports
 * contract, so the education rollup's contract check failed
 * (`educationAchievements.records.830.location: expected string`).
 *
 * Fixtures: recorded D47 reports files, every club id, name and place
 * redacted (the email is `redacted@example.invalid`):
 * - 2026-10-15 (prod): one club's location is only an email, 4 records;
 * - 2026-06-30 (staging, after that run): 4 records with no `location`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { DistrictReportsDatasetSchema } from '@taverns-red/shared-contracts'
import {
  checkRewriteSchema,
  isReportsObject,
  runStrip,
  schemaForObject,
  stripStoredObject,
  toJsonl,
  type StoredObjectMeta,
  type StripIo,
  type WriteMetadata,
} from '../stripClubContact.js'

const FIXTURES = new URL(
  '../../../packages/shared-contracts/src/__tests__/fixtures/district-reports/',
  import.meta.url
)
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf-8'))
const LINKED = () => fixture('d47-2026-10-15-linked-location.json')
const DELETED = () => fixture('d47-2026-06-30-deleted-location.json')

const EMAIL = 'redacted@example.invalid'
const LINKED_NAME = 'snapshots/2026-10-15/district_47_reports.json'
const DELETED_NAME = 'snapshots/2026-06-30/district_47_reports.json'

/** Stored the way the pipeline stores it: 2-space JSON, one gzip layer. */
const stored = (value: unknown): Buffer =>
  gzipSync(Buffer.from(JSON.stringify(value, null, 2), 'utf-8'))
const text = (bytes: Buffer): string => gunzipSync(bytes).toString('utf-8')

type Rec = Record<string, unknown>
const records = (value: unknown, section: string): Rec[] =>
  (value as { sections: Record<string, { records: Rec[] }> }).sections[section]!
    .records

describe('schemaForObject / isReportsObject', () => {
  it('maps each top-level snapshot file to its shared-contracts schema', () => {
    const id = (n: string) => schemaForObject(n)?.id ?? null
    expect(id(LINKED_NAME)).toBe('district-reports')
    expect(id('snapshots/2026-10-15/district_47.json')).toBe(
      'per-district-data'
    )
    expect(id('snapshots/2026-10-15/metadata.json')).toBe('snapshot-metadata')
    expect(id('snapshots/2026-10-15/manifest.json')).toBe('snapshot-manifest')
    expect(id('snapshots/2026-10-15/all-districts-rankings.json')).toBe(
      'all-districts-rankings'
    )
    // Analytics files have no shared-contracts schema; a nested name is not
    // the top-level file it resembles.
    expect(
      id('snapshots/2026-10-15/analytics/district_47_analytics.json')
    ).toBe(null)
    expect(id('snapshots/2026-10-15/analytics/manifest.json')).toBe(null)
    expect(id('snapshots/2026-10-15/analytics/district_47_reports.json')).toBe(
      null
    )
  })

  it('recognises only top-level district reports files', () => {
    expect(isReportsObject(LINKED_NAME)).toBe(true)
    expect(isReportsObject('snapshots/2026-10-15/district_47.json')).toBe(false)
    expect(
      isReportsObject('snapshots/2026-10-15/analytics/district_47_reports.json')
    ).toBe(false)
  })
})

describe('checkRewriteSchema', () => {
  it('flags a rewrite that breaks a contract the original met', () => {
    const before = LINKED()
    const after = structuredClone(before)
    delete records(after, 'educationAchievements')[0]!.location
    expect(checkRewriteSchema(LINKED_NAME, before, after)).toEqual({
      schema: 'district-reports',
      before: 'pass',
      after: 'fail',
      newIssues: 1,
    })
  })

  it('a rewrite that fixes a broken file passes', () => {
    const after = structuredClone(DELETED())
    for (const r of records(after, 'educationAchievements')) {
      r.location ??= ''
    }
    expect(checkRewriteSchema(DELETED_NAME, DELETED(), after)).toMatchObject({
      before: 'fail',
      after: 'pass',
      newIssues: 0,
    })
  })

  it('has nothing to check for an object without a schema', () => {
    expect(
      checkRewriteSchema('snapshots/2026-10-15/analytics/x.json', {}, {})
    ).toEqual({ schema: null, before: null, after: null, newIssues: 0 })
  })
})

describe('stripStoredObject — reports files (#2097)', () => {
  it('scrubs an email-only location to "" and never deletes the key', () => {
    const result = stripStoredObject(stored(LINKED()), LINKED_NAME)
    expect(result.changed).toBe(true)
    if (!result.changed) return
    const out = JSON.parse(text(result.bytes))
    expect(text(result.bytes)).not.toContain(EMAIL)
    for (const section of [
      'aprilDuesRenewal',
      'octoberDuesRenewal',
      'educationAchievements',
    ]) {
      for (const r of records(out, section)) {
        expect(r).toHaveProperty('location')
      }
    }
    expect(result.placeValuesScrubbed).toBe(4)
    expect(result.keysRestored).toBe(0)
    expect(result.schemaCheck).toMatchObject({
      schema: 'district-reports',
      before: 'pass',
      after: 'pass',
    })
    expect(DistrictReportsDatasetSchema.safeParse(out).success).toBe(true)
  })

  it('changes only the linked location lines, byte for byte', () => {
    const original = text(stored(LINKED()))
    const result = stripStoredObject(stored(LINKED()), LINKED_NAME)
    if (!result.changed) throw new Error('expected a change')
    const expected = original
      .split('\n')
      .map(line =>
        line.includes(`"location": "${EMAIL}"`) ? line.replace(EMAIL, '') : line
      )
      .join('\n')
    expect(text(result.bytes)).toBe(expected)
  })

  it('restores a deleted location as "", after `name`, and the file meets its contract again', () => {
    const original = stored(DELETED())
    const result = stripStoredObject(original, DELETED_NAME)
    expect(result.changed).toBe(true)
    if (!result.changed) return
    expect(result.keysRestored).toBe(4)
    expect(result.placeValuesScrubbed).toBe(0)
    expect(result.schemaCheck).toMatchObject({ before: 'fail', after: 'pass' })
    const out = JSON.parse(text(result.bytes))
    for (const r of records(out, 'educationAchievements')) {
      expect(Object.keys(r).indexOf('location')).toBe(
        Object.keys(r).indexOf('name') + 1
      )
    }
    // Every other line is as it was: only `"location": ""` lines are added.
    const added = text(result.bytes)
      .split('\n')
      .filter(l => !text(original).split('\n').includes(l))
    expect(new Set(added)).toEqual(new Set(['          "location": "",']))
    expect(added).toHaveLength(4)
  })

  it('is idempotent', () => {
    for (const [make, name] of [
      [LINKED, LINKED_NAME],
      [DELETED, DELETED_NAME],
    ] as const) {
      const first = stripStoredObject(stored(make()), name)
      if (!first.changed) throw new Error('expected a change')
      expect(stripStoredObject(first.bytes, name)).toEqual({
        changed: false,
        gzipLayers: 1,
      })
    }
  })
})

// ------------------------------------------------------------- runStrip

const md5 = (bytes: Buffer): string =>
  createHash('md5').update(bytes).digest('base64')

const HEADERS = {
  contentType: 'application/json',
  contentEncoding: 'gzip',
  cacheControl: 'public, max-age=3600, must-revalidate, no-transform',
}

class FakeBucket implements StripIo {
  objects = new Map<string, { bytes: Buffer; meta: StoredObjectMeta }>()
  writes: string[] = []
  private nextGeneration = 5000
  put(name: string, bytes: Buffer, headers: Partial<WriteMetadata> = HEADERS) {
    this.objects.set(name, {
      bytes,
      meta: {
        name,
        generation: String(this.nextGeneration++),
        md5Hash: md5(bytes),
        ...headers,
      },
    })
  }
  async list(prefix: string): Promise<StoredObjectMeta[]> {
    return [...this.objects.values()]
      .filter(o => o.meta.name.startsWith(prefix))
      .map(o => ({ ...o.meta }))
  }
  async read(name: string, generation: string): Promise<Buffer> {
    const o = this.objects.get(name)
    if (!o || o.meta.generation !== generation) {
      throw Object.assign(new Error('No such object'), { code: 404 })
    }
    return o.bytes
  }
  async write(
    name: string,
    bytes: Buffer,
    metadata: WriteMetadata,
    ifGenerationMatch: string
  ): Promise<StoredObjectMeta> {
    this.writes.push(name)
    if (this.objects.get(name)?.meta.generation !== ifGenerationMatch) {
      throw Object.assign(new Error('Precondition Failed'), { code: 412 })
    }
    this.put(name, bytes, metadata)
    return { ...this.objects.get(name)!.meta }
  }
}

/** A FAC club whose street is only a link (the scrubber drops the key). */
const facDistrict = () => ({
  districtId: '47',
  data: {
    clubs: [
      {
        clubId: '9000003',
        address: { street: 'https://example.invalid/redacted', city: 'X' },
      },
    ],
  },
})

function seeded(): FakeBucket {
  const b = new FakeBucket()
  b.put(LINKED_NAME, stored(LINKED()))
  b.put(DELETED_NAME, stored(DELETED()))
  b.put('snapshots/2026-10-15/district_47.json', stored(facDistrict()))
  return b
}

describe('runStrip — reports files (#2097)', () => {
  it('repairs both broken shapes and records the contract check in the audit', async () => {
    const b = seeded()
    const { rows, summary } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: ['2026-06-30', '2026-10-15'],
      dryRun: false,
    })
    const row = (name: string) => rows.find(r => r.path === name)!
    expect(row(DELETED_NAME)).toMatchObject({
      action: 'stripped',
      keysRestored: 4,
      placeValuesScrubbed: 0,
      schema: 'district-reports',
      schemaBefore: 'fail',
      schemaAfter: 'pass',
    })
    expect(row(LINKED_NAME)).toMatchObject({
      action: 'stripped',
      keysRestored: 0,
      placeValuesScrubbed: 4,
      schemaBefore: 'pass',
      schemaAfter: 'pass',
    })
    for (const name of [LINKED_NAME, DELETED_NAME]) {
      const after = JSON.parse(text(b.objects.get(name)!.bytes))
      expect(DistrictReportsDatasetSchema.safeParse(after).success).toBe(true)
    }
    // A contract the original already failed is recorded, not a reason to
    // leave a link live: the rewrite added no new issue (synthetic FAC file).
    expect(row('snapshots/2026-10-15/district_47.json')).toMatchObject({
      action: 'stripped',
      schema: 'per-district-data',
      schemaBefore: 'fail',
      schemaAfter: 'fail',
    })
    expect(summary).toMatchObject({
      keysRestored: 4,
      schemaFailures: 1,
      errors: 0,
    })
    expect(toJsonl(rows)).not.toContain(EMAIL)
  })

  it('only: "reports" lists and rewrites reports files alone', async () => {
    const b = seeded()
    const { rows } = await runStrip(b, {
      bucket: 'toast-stats-data-staging',
      dates: ['2026-10-15'],
      dryRun: true,
      only: 'reports',
    })
    expect(rows.map(r => r.path)).toEqual([LINKED_NAME])
  })
})
