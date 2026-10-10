/**
 * Pre-promotion content gate — bucket I/O end to end (#1715, #1726).
 *
 * Daily run 38039833417 held promotion because the gate crashed reading
 * `f.metadata.size`: with `fields` set, `@google-cloud/storage` 8.2.0's
 * getFiles returns plain JSON-API items, not File instances, so there is no
 * `.metadata`. The decision-logic tests never touched the listing, and so
 * proved the plan rather than the SDK.
 *
 * Here the fake bucket reproduces the SDK's real behaviour (bucket.js
 * getFiles: `if (query.fields) return file`; otherwise a File with
 * `.metadata`), and its plain items are pinned key-for-key to a listing
 * recorded from staging (fixtures/gcs-get-files/with-fields.json), so the
 * fake cannot drift from reality unnoticed.
 */

import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  LIST_FIELDS,
  listPromoted,
  runContentGate,
  selfCheckListing,
  toMeta,
  type GateBucket,
} from '../promotionContentGateIo.js'

const RECORDED = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, 'fixtures/gcs-get-files/with-fields.json'),
    'utf-8'
  )
) as {
  items: Array<Record<string, string>>
  subPrefixResponse: { prefixes: string[] }
}

interface Stored {
  bytes: Uint8Array
  contentEncoding?: string
}

/**
 * A bucket that answers getFiles the way @google-cloud/storage 8.2.0 does:
 * plain JSON-API items when `fields` is set, File-like `{ name, metadata }`
 * otherwise; `[items, nextQuery, apiResponse]` with `prefixes` when
 * `autoPaginate: false`.
 */
function fakeBucket(objects: Record<string, Stored>): GateBucket & {
  calls: Array<Record<string, unknown>>
} {
  const calls: Array<Record<string, unknown>> = []
  const resource = (name: string, o: Stored): Record<string, string> => {
    const md5 = createHash('md5').update(o.bytes).digest('base64')
    // Key order and presence as recorded: contentEncoding only when set.
    const item: Record<string, string> = {
      name,
      size: String(o.bytes.length),
      md5Hash: md5,
    }
    if (o.contentEncoding) item.contentEncoding = o.contentEncoding
    item.crc32c = md5.slice(0, 8)
    return item
  }
  return {
    calls,
    async getFiles(query) {
      calls.push(query)
      const prefix = String(query.prefix ?? '')
      const delimiter = query.delimiter as string | undefined
      const names = Object.keys(objects)
        .filter(n => n.startsWith(prefix))
        .sort()
      const prefixes = new Set<string>()
      const direct: string[] = []
      for (const n of names) {
        const rest = n.slice(prefix.length)
        const cut = delimiter ? rest.indexOf(delimiter) : -1
        if (cut >= 0) prefixes.add(prefix + rest.slice(0, cut + 1))
        else direct.push(n)
      }
      const items = direct.map(n => {
        const meta = resource(n, objects[n]!)
        return query.fields ? meta : { name: n, metadata: meta }
      })
      if (query.autoPaginate === false) {
        return [
          items,
          null,
          { kind: 'storage#objects', prefixes: [...prefixes] },
        ]
      }
      return [items]
    },
    file(name) {
      return {
        async download() {
          const o = objects[name]
          if (!o) throw new Error(`No such object: ${name}`)
          return [o.bytes]
        },
      }
    },
  }
}

const gz = (value: unknown): Stored => ({
  bytes: gzipSync(Buffer.from(JSON.stringify(value))),
  contentEncoding: 'gzip',
})
const plain = (value: unknown): Stored => ({
  bytes: new Uint8Array(Buffer.from(JSON.stringify(value))),
})

function point(date: string) {
  return {
    date,
    snapshotId: date,
    membership: 2160,
    payments: 3355,
    dcpGoals: 269,
    distinguishedTotal: 5,
    clubCounts: {
      total: 161,
      thriving: 29,
      vulnerable: 46,
      interventionRequired: 86,
    },
  }
}

function programYearFile(...dates: string[]) {
  return {
    districtId: '61',
    programYear: '2026-2027',
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    lastUpdated: '2026-10-09T12:12:11.676Z',
    dataPoints: dates.map(point),
    summary: {
      totalDataPoints: dates.length,
      membershipStart: 2937,
      membershipEnd: 2160,
      membershipPeak: 3067,
      membershipLow: 2160,
    },
  }
}

const metadata = {
  districtId: '61',
  lastUpdated: '2026-10-09T12:12:11.680Z',
  availableProgramYears: ['2024-2025', '2025-2026', '2026-2027'],
  totalDataPoints: 247,
}

const awards = {
  metadata: {
    snapshotId: '2026-10-08',
    calculatedAt: '2026-10-09T12:00:00.000Z',
    totalDistricts: 2,
  },
  clubStrengthAward: {
    qualifyingDistricts: [],
    allDistricts: ['61', '86'].map(id => ({
      districtId: id,
      districtName: `District ${id}`,
      region: '1',
      currentAvgClubSize: 20,
      priorYearAvgClubSize: 19,
      growthPercent: 5,
      qualifies: false,
    })),
  },
}

const latest = (date: string) => ({
  _format: { version: '1.0.0', type: 'manifest' },
  latestSnapshotDate: date,
  generatedAt: '2026-10-09T12:20:00.000Z',
})

const PY = 'time-series/district_61/2026-2027.json'

/** Prod as of yesterday; staging is today's run on top of it. */
function buckets(overrides: Record<string, Stored> = {}) {
  const shared = {
    'config/club-index.json': plain({ clubs: {} }),
    'time-series/district_61/index-metadata.json': gz(metadata),
  }
  const prod = fakeBucket({
    ...shared,
    'v1/latest.json': plain(latest('2026-09-30')),
    'v1/dates.json': plain({ dates: ['2026-09-30'] }),
    'config/district-snapshot-index.json': plain({
      generatedAt: '2026-10-01T00:00:00.000Z',
      districts: { '61': ['2026-09-30'] },
    }),
    [PY]: gz(programYearFile('2026-09-30')),
    'snapshots/2026-09-30/district_61.json': plain({ districtId: '61' }),
  })
  const staging = fakeBucket({
    ...shared,
    'v1/latest.json': plain(latest('2026-10-08')),
    'v1/dates.json': plain({ dates: ['2026-09-30', '2026-10-08'] }),
    'config/district-snapshot-index.json': plain({
      generatedAt: '2026-10-09T12:19:08.103Z',
      districts: { '61': ['2026-09-30', '2026-10-08'] },
    }),
    [PY]: gz(programYearFile('2026-09-30', '2026-10-08')),
    'snapshots/2026-09-30/district_61.json': plain({ districtId: '61' }),
    'snapshots/2026-10-08/district_61.json': plain({ districtId: '61' }),
    'snapshots/2026-10-08/competitive-awards.json': plain(awards),
    ...overrides,
  })
  return { staging, prod }
}

describe('fake bucket matches the recorded SDK shape', () => {
  it('plain items carry exactly the recorded keys, in the recorded types', () => {
    const { staging } = buckets()
    return staging
      .getFiles({ prefix: 'time-series/', fields: LIST_FIELDS })
      .then(([items]) => {
        const recordedGzip = RECORDED.items.find(i => i.contentEncoding)!
        const fakeGzip = (items as Array<Record<string, unknown>>).find(
          i => i.contentEncoding
        )!
        expect(Object.keys(fakeGzip).sort()).toEqual(
          Object.keys(recordedGzip).sort()
        )
        expect('metadata' in fakeGzip).toBe(false)
        expect(typeof fakeGzip.size).toBe(typeof recordedGzip.size)
      })
  })
})

describe('toMeta', () => {
  it.each(RECORDED.items)(
    'reads a recorded plain item ($name)',
    (item: Record<string, string>) => {
      expect(toMeta(item)).toEqual({
        name: item.name,
        size: item.size,
        crc32c: item.crc32c,
        md5Hash: item.md5Hash,
        contentEncoding: item.contentEncoding,
      })
    }
  )

  it('reads a File-shaped item (values under .metadata)', () => {
    const item = RECORDED.items.find(i => i.contentEncoding)!
    expect(toMeta({ name: item.name, metadata: item })).toEqual({
      name: item.name,
      size: item.size,
      crc32c: item.crc32c,
      md5Hash: item.md5Hash,
      contentEncoding: 'gzip',
    })
  })

  it('leaves contentEncoding undefined when the listing omits it', () => {
    const item = RECORDED.items.find(i => !i.contentEncoding)!
    expect(toMeta(item).contentEncoding).toBeUndefined()
  })

  it('throws when an item has no crc32c, md5Hash or size to diff on', () => {
    // A `fields` mask that drops them would make every object look
    // unchanged — the gate would check nothing and pass. Fail closed.
    expect(() => toMeta({ name: 'v1/latest.json' })).toThrow(
      /crc32c, md5Hash or size/
    )
    expect(() =>
      toMeta({ name: 'v1/latest.json', metadata: { name: 'v1/latest.json' } })
    ).toThrow(/crc32c, md5Hash or size/)
  })

  it('throws on an item with no name rather than diffing garbage', () => {
    expect(() => toMeta({ size: '1' })).toThrow(/name/)
    expect(() => toMeta(null)).toThrow(/name/)
  })
})

describe('listPromoted', () => {
  it('lists every promoted object, snapshots one date dir at a time', async () => {
    const { staging } = buckets()
    const listed = await listPromoted(staging)
    expect(listed.map(o => o.name).sort()).toContain(
      'snapshots/2026-10-08/competitive-awards.json'
    )
    expect(listed.find(o => o.name === PY)).toMatchObject({
      contentEncoding: 'gzip',
    })
    expect(listed.every(o => typeof o.size === 'string')).toBe(true)
    // Every listing that reads object metadata asks for `fields`.
    const metaCalls = staging.calls.filter(c => c.autoPaginate !== false)
    expect(metaCalls.every(c => c.fields === LIST_FIELDS)).toBe(true)
  })
})

describe('runContentGate end to end over the real SDK shape', () => {
  it('passes good data and actually reads what changed', async () => {
    const { staging, prod } = buckets()
    const result = await runContentGate(staging, prod, () => {}, {
      random: () => 0,
    })
    expect(result.failures).toEqual([])
    expect(result.promote).toBe(true)
    const checked = result.checked.map(c => c.path)
    expect(checked).toContain(PY)
    expect(checked).toContain('snapshots/2026-10-08/competitive-awards.json')
    expect(checked).toContain('v1/latest.json')
    expect(checked).not.toContain('config/club-index.json') // unchanged
  })

  it('holds on nested-gzip time-series (the #1702 class)', async () => {
    const nested: Stored = {
      bytes: gzipSync(
        gzipSync(Buffer.from(JSON.stringify(programYearFile('2026-10-08'))))
      ),
      contentEncoding: 'gzip',
    }
    const { staging, prod } = buckets({ [PY]: nested })
    const result = await runContentGate(staging, prod, () => {}, {
      random: () => 0,
    })
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path)).toContain(PY)
  })
})

describe('selfCheckListing (read-only probe of the real SDK shape)', () => {
  it('lists one prefix through the gate path and reports what it saw', async () => {
    const { staging } = buckets()
    const report = await selfCheckListing(staging, 'time-series/')
    expect(report.count).toBeGreaterThan(0)
    expect(report.sample.contentEncoding).toBe('gzip')
    expect(staging.calls.every(c => c.fields === LIST_FIELDS)).toBe(true)
  })

  it('throws on an empty listing (nothing proven)', async () => {
    const { staging } = buckets()
    await expect(selfCheckListing(staging, 'nope/')).rejects.toThrow(
      /no objects/
    )
  })
})
