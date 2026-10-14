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
import { gunzipSync, gzipSync } from 'node:zlib'
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
function buckets(
  overrides: Record<string, Stored> = {},
  prodOverrides: Record<string, Stored> = {}
) {
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
    ...prodOverrides,
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

describe('runContentGate checks the club-district history shard set (#1782)', () => {
  const DIR = 'config/club-district-history/'
  const clubIndex = (shards: string[]) => ({
    _format: { version: '1.0.0', type: 'club-district-history-index' },
    asOf: '2026-10-08',
    sourcesUpdatedAt: '2026-10-09T12:00:00.000Z',
    granularity: 'program-year',
    programYears: ['2026-2027'],
    totalClubs: shards.length,
    shards,
    duplicates: [],
  })
  const clubShard = (key: string) => ({
    _format: { version: '1.0.0', type: 'club-district-history-shard' },
    shard: key,
    asOf: '2026-10-08',
    clubs: {
      [`9${key}`]: {
        name: `Club 9${key}`,
        formerNames: [],
        firstSeen: '2026-07-26',
        lastSeen: '2026-10-08',
        spans: [{ from: '2026-07-26', to: null, districtId: '61' }],
        byProgramYear: { '2026-2027': '61' },
      },
    },
  })
  const run = async (
    staged: Record<string, Stored>,
    prodExtra: Record<string, Stored> = {}
  ) => {
    const { staging, prod } = buckets(staged, prodExtra)
    return runContentGate(staging, prod, () => {}, { random: () => 0 })
  }

  it('passes an index whose every shard is staged', async () => {
    const result = await run({
      [`${DIR}index.json`]: plain(clubIndex(['77', '99'])),
      [`${DIR}77.json`]: plain(clubShard('77')),
      [`${DIR}99.json`]: plain(clubShard('99')),
    })
    expect(result.failures).toEqual([])
    expect(result.checked.map(c => c.path)).toEqual(
      expect.arrayContaining([
        `${DIR}index.json`,
        `${DIR}77.json`,
        `${DIR}99.json`,
      ])
    )
  })

  it('holds an index that names a shard staging does not have', async () => {
    const result = await run({
      [`${DIR}index.json`]: plain(clubIndex(['77', '99'])),
      [`${DIR}77.json`]: plain(clubShard('77')),
    })
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path)).toEqual([`${DIR}index.json`])
  })

  it('holds an index that drops a shard prod already serves', async () => {
    const result = await run(
      {
        [`${DIR}index.json`]: plain(clubIndex(['77'])),
        [`${DIR}77.json`]: plain(clubShard('77')),
      },
      { [`${DIR}99.json`]: plain(clubShard('99')) }
    )
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path)).toEqual([`${DIR}index.json`])
  })
})

describe('runContentGate reads every object in the run manifest (#1762, D-13)', () => {
  const DATE = '2026-10-10'
  const sha256 = (s: Stored) => {
    const body =
      s.contentEncoding === 'gzip' ? gunzipSync(Buffer.from(s.bytes)) : s.bytes
    return createHash('sha256').update(body).digest('hex')
  }
  const entry = (p: string, s: Stored) => ({
    path: p,
    sha256: sha256(s),
    date: /^snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(p)?.[1] ?? null,
    stage: 'daily-upload',
  })

  /**
   * A full run's worth of changed district snapshots, 400 > the old
   * 150-object generic sample; the corrupt one sorts LAST, so a sampler
   * fed `random = () => 0` (always the first of the pool) never picks it.
   */
  function fullRun(corrupt: Stored) {
    const written: Record<string, Stored> = {}
    for (let i = 100; i < 500; i++) {
      written[`snapshots/${DATE}/district_${i}.json`] = gz({ districtId: i })
    }
    const CORRUPT = `snapshots/${DATE}/district_Z99.json`
    written[CORRUPT] = corrupt
    const { staging, prod } = buckets(written)
    const manifest = Object.entries(written).map(([p, s]) => entry(p, s))
    return { staging, prod, manifest, CORRUPT }
  }

  const nestedGzip: Stored = {
    bytes: gzipSync(gzipSync(Buffer.from('{"districtId":"Z99"}'))),
    contentEncoding: 'gzip',
  }

  it('control: the old sampler never reads the corrupt object, so it passes', async () => {
    const { staging, prod } = fullRun(nestedGzip)
    const result = await runContentGate(staging, prod, () => {}, {
      random: () => 0,
    })
    expect(result.promote).toBe(true)
    expect(result.sampledOut).toBeGreaterThan(0)
  })

  it('holds: a corrupt manifest object is read even outside the old sample', async () => {
    const { staging, prod, manifest, CORRUPT } = fullRun(nestedGzip)
    const result = await runContentGate(staging, prod, () => {}, {
      random: () => 0,
      manifest,
    })
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path)).toEqual([CORRUPT])
    const checked = new Set(result.checked.map(c => c.path))
    for (const m of manifest) expect(checked.has(m.path), m.path).toBe(true)
    expect(result.manifestCount).toBe(manifest.length)
  })

  it('passes a clean run with every manifest object checked', async () => {
    const { staging, prod, manifest } = fullRun(gz({ districtId: 'Z99' }))
    const result = await runContentGate(staging, prod, () => {}, {
      random: () => 0,
      manifest,
    })
    expect(result.failures).toEqual([])
    expect(result.promote).toBe(true)
  })

  it('holds when the staged bytes are not what the run wrote (sha256 mismatch)', async () => {
    const p = `snapshots/${DATE}/district_61.json`
    const { staging, prod } = buckets({ [p]: gz({ districtId: '61' }) })
    const manifest = [
      { ...entry(p, gz({ districtId: '61' })), sha256: 'f'.repeat(64) },
    ]
    const result = await runContentGate(staging, prod, () => {}, { manifest })
    expect(result.promote).toBe(false)
    expect(result.failures[0]).toMatchObject({ path: p })
    expect(result.failures[0]?.reason).toMatch(/sha256/)
  })

  it('holds when a manifest object is missing from staging', async () => {
    const p = `snapshots/${DATE}/district_404.json`
    const { staging, prod } = buckets()
    const result = await runContentGate(staging, prod, () => {}, {
      manifest: [entry(p, gz({}))],
    })
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path)).toEqual([p])
  })

  it('reads written objects even when they equal prod (the run wrote them)', async () => {
    const { staging, prod } = buckets()
    const p = 'config/club-index.json'
    const result = await runContentGate(staging, prod, () => {}, {
      manifest: [entry(p, plain({ clubs: {} }))],
    })
    expect(result.checked.map(c => c.path)).toContain(p)
  })

  it('compares every written program-year file with prod (not only the newest)', async () => {
    const OLD = 'time-series/district_61/2025-2026.json'
    const { staging, prod } = buckets({
      [OLD]: gz({ ...programYearFile('2026-05-31'), programYear: '2025-2026' }),
    })
    const manifest = [
      entry(PY, gz(programYearFile('2026-09-30', '2026-10-08'))),
      entry(
        OLD,
        gz({ ...programYearFile('2026-05-31'), programYear: '2025-2026' })
      ),
    ]
    const result = await runContentGate(staging, prod, () => {}, { manifest })
    const checked = result.checked.map(c => c.path)
    expect(checked).toContain(OLD)
    expect(checked).toContain(PY)
  })

  it('does not read written objects outside the promoted prefixes (raw-csv, stores)', async () => {
    const { staging, prod } = buckets()
    const result = await runContentGate(staging, prod, () => {}, {
      manifest: [
        entry(
          'raw-csv/2026-10-10/district-61/club-performance.csv',
          plain('x')
        ),
        entry('club-trends/district_61.json', plain({})),
      ],
    })
    const checked = result.checked.map(c => c.path)
    expect(checked.some(p => p.startsWith('raw-csv/'))).toBe(false)
    expect(checked.some(p => p.startsWith('club-trends/'))).toBe(false)
  })

  it('still samples changed objects the run did not write: promotion copies whole prefixes until #1763', async () => {
    // A held run's corrupt leftover is in staging, not in this run's manifest.
    const LEFTOVER = 'snapshots/2026-10-08/district_61.json'
    const { staging, prod } = buckets({ [LEFTOVER]: nestedGzip })
    const result = await runContentGate(staging, prod, () => {}, {
      random: () => 0,
      manifest: [entry('v1/latest.json', plain(latest('2026-10-08')))],
    })
    expect(result.promote).toBe(false)
    expect(result.failures.map(f => f.path)).toContain(LEFTOVER)
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
