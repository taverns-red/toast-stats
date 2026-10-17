/**
 * Which time-series files need uploading (#1731, plan E2-1).
 *
 * The listings below are recorded from the real
 * `gcloud storage objects list <prefix> --format=json` (SDK 583.0.0,
 * read-only, 2026-10-10). The prod one shows two shapes the parser must
 * handle: a noncurrent generation listed ahead of the live one, and
 * `custom_fields` as a key/value object.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import {
  parseObjectsListing,
  planTimeSeriesCarry,
  planTimeSeriesUploads,
} from '../timeSeriesPublishPlan.js'

const FIXTURES = path.join(__dirname, 'fixtures/gcloud-objects-list')
const fixture = (name: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'))

const sha = (s: string): string =>
  createHash('sha256').update(Buffer.from(s)).digest('hex')

/** A live object as the real listing prints a `cp -Z --custom-metadata` one. */
function live(
  name: string,
  custom?: Record<string, string>,
  over: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    bucket: 'toast-stats-data-staging',
    cache_control: 'public, max-age=3600, no-transform',
    content_encoding: 'gzip',
    content_type: 'application/json',
    name,
    size: 730,
    ...(custom ? { custom_fields: custom } : {}),
    ...over,
  }
}

describe('parseObjectsListing (#1731)', () => {
  it('reads the recorded staging listing: live objects, no custom fields', () => {
    const remote = parseObjectsListing(fixture('staging-live.json'))
    const obj = remote.get('time-series/district_61/2020-2021.json')
    expect(obj).toEqual({
      sha256: undefined,
      contentEncoding: 'gzip',
      contentType: 'application/json',
      cacheControl: 'public, max-age=3600, no-transform',
    })
  })

  it('keeps the live generation when a noncurrent one is listed first (prod)', () => {
    const remote = parseObjectsListing(
      fixture('prod-noncurrent-and-custom-fields.json')
    )
    expect(remote.size).toBe(1)
    expect(
      remote.get('time-series/district_61/2020-2021.json')?.cacheControl
    ).toBe('public, max-age=3600, no-transform')
  })

  it('reads an empty prefix as no objects', () => {
    expect(parseObjectsListing(fixture('empty-prefix.json')).size).toBe(0)
  })

  it('reads sha256 out of custom_fields', () => {
    const remote = parseObjectsListing([
      live('time-series/d/a.json', { sha256: sha('a') }),
    ])
    expect(remote.get('time-series/d/a.json')?.sha256).toBe(sha('a'))
  })

  it('refuses a listing that is not an array of named objects', () => {
    expect(() => parseObjectsListing({ items: [] })).toThrow()
    expect(() => parseObjectsListing([{ size: 1 }])).toThrow()
  })
})

describe('planTimeSeriesUploads (#1731)', () => {
  const prefix = 'time-series/'
  const local = [
    { rel: 'district_61/2025-2026.json', sha256: sha('old') },
    { rel: 'district_61/2026-2027.json', sha256: sha('new') },
  ]

  it('uploads nothing when every remote sha and header matches', () => {
    const remote = parseObjectsListing([
      live('time-series/district_61/2025-2026.json', { sha256: sha('old') }),
      live('time-series/district_61/2026-2027.json', { sha256: sha('new') }),
    ])
    expect(planTimeSeriesUploads(local, remote, prefix)).toEqual({
      upload: [],
      unchanged: 2,
    })
  })

  it('uploads only the file whose content changed', () => {
    const remote = parseObjectsListing([
      live('time-series/district_61/2025-2026.json', { sha256: sha('old') }),
      live('time-series/district_61/2026-2027.json', { sha256: sha('prev') }),
    ])
    expect(planTimeSeriesUploads(local, remote, prefix)).toEqual({
      upload: [local[1]],
      unchanged: 1,
    })
  })

  it('uploads files that are missing remotely or carry no sha (first run)', () => {
    const remote = parseObjectsListing(fixture('staging-live.json'))
    const plan = planTimeSeriesUploads(
      [{ rel: 'district_61/2020-2021.json', sha256: sha('x') }, ...local],
      remote,
      prefix
    )
    expect(plan.unchanged).toBe(0)
    expect(plan.upload).toHaveLength(3)
  })

  it('re-uploads a matching sha whose headers are not the CDN ones', () => {
    const cases: Record<string, unknown>[] = [
      { content_encoding: undefined },
      { content_type: 'text/plain' },
      { cache_control: 'no-store' },
    ]
    for (const over of cases) {
      const remote = parseObjectsListing([
        live(
          'time-series/district_61/2025-2026.json',
          { sha256: sha('old') },
          over
        ),
      ])
      const plan = planTimeSeriesUploads([local[0]], remote, prefix)
      expect(plan.upload, JSON.stringify(over)).toEqual([local[0]])
    }
  })
})

// #1763 PR 2: with the whole-prefix rsync gone, a file that is current in
// staging but not in prod (a held run uploaded it; this run, finding it
// unchanged, did not) must still be listed in this run's manifest, or it
// would never reach prod.
describe('planTimeSeriesCarry (#1763)', () => {
  const prefix = 'time-series/'
  const local = [
    { rel: 'district_61/2024-2025.json', sha256: sha('a') },
    { rel: 'district_61/2025-2026.json', sha256: sha('b') },
    { rel: 'district_61/2026-2027.json', sha256: sha('c') },
  ]
  const staging = parseObjectsListing([
    live('time-series/district_61/2024-2025.json', { sha256: sha('a') }),
    live('time-series/district_61/2025-2026.json', { sha256: sha('b') }),
    // 2026-2027 changed this run: uploaded, so recorded already.
    live('time-series/district_61/2026-2027.json', { sha256: sha('old') }),
  ])

  it('carries the files staging already holds that prod does not', () => {
    const prod = parseObjectsListing([
      live('time-series/district_61/2024-2025.json', { sha256: sha('a') }),
      live('time-series/district_61/2025-2026.json', { sha256: sha('prev') }),
    ])
    expect(planTimeSeriesCarry(local, staging, prod, prefix)).toEqual([
      local[1],
    ])
  })

  it('carries a file prod lacks, or holds without a sha or the CDN headers', () => {
    const prod = parseObjectsListing([
      live('time-series/district_61/2024-2025.json', undefined),
      live(
        'time-series/district_61/2025-2026.json',
        { sha256: sha('b') },
        { cache_control: 'no-store' }
      ),
    ])
    expect(planTimeSeriesCarry(local, staging, prod, prefix)).toEqual([
      local[0],
      local[1],
    ])
  })

  it('never carries a file this run uploads (it is recorded as an upload)', () => {
    const plan = planTimeSeriesUploads(local, staging, prefix)
    const carry = planTimeSeriesCarry(local, staging, new Map(), prefix)
    expect(carry).toEqual([local[0], local[1]])
    for (const f of plan.upload) expect(carry).not.toContainEqual(f)
  })

  it('carries nothing when prod matches staging', () => {
    expect(planTimeSeriesCarry(local, staging, staging, prefix)).toEqual([])
  })
})
