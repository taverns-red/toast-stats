/**
 * Pre-promotion content gate (#1715, plan S1-4).
 *
 * Fixtures model what the reader gets from a staging object: the stored bytes
 * plus its Content-Encoding. The gate peels exactly the one layer a browser
 * peels, then requires JSON of the right shape. Each failure class from the
 * #1702 / #1704 incidents has a fixture, and so does the good case: a gate
 * that false-holds legitimate data is as harmful as one that misses bad data.
 */

import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  buildContentGateSummary,
  checkLatestAgreesWithIndex,
  checkObject,
  classifyObject,
  diffChangedObjects,
  evaluateContentGate,
  planContentChecks,
  type CheckContext,
  type GcsObjectMeta,
  type StoredObject,
} from '../promotionContentGate.js'

const enc = (s: string) => new TextEncoder().encode(s)

/** A stored object: JSON wrapped in `layers` gzip layers. */
function stored(
  value: unknown,
  opts: { layers?: number; contentEncoding?: string } = {}
): StoredObject {
  let bytes: Uint8Array = enc(
    typeof value === 'string' ? value : JSON.stringify(value)
  )
  const layers = opts.layers ?? 1
  for (let i = 0; i < layers; i++) bytes = gzipSync(bytes)
  return {
    bytes,
    contentEncoding: opts.contentEncoding ?? (layers > 0 ? 'gzip' : undefined),
  }
}

const plain = (value: unknown) => stored(value, { layers: 0 })

// Modelled on the real prod payloads (D61, 2026-10-09).
const metadata = {
  districtId: '61',
  lastUpdated: '2026-10-09T12:12:11.680Z',
  availableProgramYears: ['2024-2025', '2025-2026', '2026-2027'],
  totalDataPoints: 247,
}

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

function awards(priorYearAvgClubSizes: Array<number | null>) {
  const allDistricts = priorYearAvgClubSizes.map((prior, i) => ({
    districtId: String(i + 1),
    districtName: `District ${i + 1}`,
    region: '1',
    currentAvgClubSize: 20,
    priorYearAvgClubSize: prior,
    growthPercent: prior === null ? null : 0,
    qualifies: false,
  }))
  return {
    metadata: {
      snapshotId: '2026-10-08',
      calculatedAt: '2026-10-09T12:00:00.000Z',
      totalDistricts: allDistricts.length,
    },
    clubStrengthAward: { qualifyingDistricts: [], allDistricts },
  }
}

const analytics = {
  metadata: {
    schemaVersion: '1.0.0',
    computedAt: '2026-10-09T12:00:00.000Z',
    snapshotDate: '2026-10-08',
    districtId: '61',
  },
  data: { districtId: '61' },
}

const snapshotIndex = {
  generatedAt: '2026-10-09T12:19:08.103Z',
  districts: { '61': ['2026-09-30', '2026-10-08'], '86': ['2026-10-08'] },
}

const latest = (date: string) => ({
  _format: { version: '1.0.0', type: 'manifest' },
  latestSnapshotDate: date,
  generatedAt: '2026-10-09T12:20:00.000Z',
})

const CTX: CheckContext = {
  latestSnapshotDate: '2026-10-08',
  availableDates: ['2025-06-30', '2025-10-08', '2026-09-30', '2026-10-08'],
}

const PY_PATH = 'time-series/district_61/2026-2027.json'
const META_PATH = 'time-series/district_61/index-metadata.json'
const AWARDS_PATH = 'snapshots/2026-10-08/competitive-awards.json'
const ANALYTICS_PATH =
  'snapshots/2026-10-08/analytics/district_61_analytics.json'

const check = (
  path: string,
  object: StoredObject,
  ctx: CheckContext = CTX,
  prod: StoredObject | null = null
) => checkObject({ path, kind: classifyObject(path)! }, object, prod, ctx)

// ---------------------------------------------------------------------------

describe('classifyObject', () => {
  it.each([
    [META_PATH, 'time-series-metadata'],
    [PY_PATH, 'time-series-program-year'],
    [AWARDS_PATH, 'competitive-awards'],
    [ANALYTICS_PATH, 'district-analytics'],
    [
      'snapshots/2026-10-08/analytics/district_61_membership.json',
      'district-analytics',
    ],
    ['snapshots/2026-10-08/analytics/manifest.json', 'json'],
    ['config/district-snapshot-index.json', 'snapshot-index'],
    ['v1/latest.json', 'latest'],
    ['snapshots/2026-10-08/district_61.json', 'json'],
    ['club-trends/district_61/2026-2027.json', 'json'],
  ])('%s → %s', (path, kind) => {
    expect(classifyObject(path)).toBe(kind)
  })

  it('does not content-check non-JSON objects', () => {
    expect(classifyObject('snapshots/2026-10-08/raw.csv')).toBeNull()
  })
})

describe('diffChangedObjects — only what promotion would copy', () => {
  const meta = (name: string, crc32c: string, size = 10): GcsObjectMeta => ({
    name,
    crc32c,
    size,
  })

  it('keeps new objects and objects whose bytes differ; drops identical ones', () => {
    const changed = diffChangedObjects(
      [meta('a.json', 'X'), meta('b.json', 'Y'), meta('c.json', 'Z')],
      [meta('a.json', 'X'), meta('b.json', 'OLD')]
    )
    expect(changed.map(o => o.name)).toEqual(['b.json', 'c.json'])
  })

  it('treats a size change as a change even when no hash is listed', () => {
    const changed = diffChangedObjects(
      [{ name: 'a.json', size: 11 }],
      [{ name: 'a.json', size: 10 }]
    )
    expect(changed.map(o => o.name)).toEqual(['a.json'])
  })
})

describe('checkObject — decode (#1702)', () => {
  it('passes a single-gzip time-series file (the healthy -Z upload)', () => {
    expect(check(PY_PATH, stored(programYearFile('2026-10-08')))).toBeNull()
  })

  it('passes a plain, unencoded JSON object', () => {
    expect(check(META_PATH, plain(metadata))).toBeNull()
  })

  it('fails a double-gzipped time-series file', () => {
    const failure = check(
      PY_PATH,
      stored(programYearFile('2026-10-08'), { layers: 2 })
    )
    expect(failure).toMatch(/gzip/)
  })

  it('fails a double-gzipped store object of any kind', () => {
    const failure = check(
      'club-trends/district_61/2026-2027.json',
      stored({ ok: true }, { layers: 2 })
    )
    expect(failure).toMatch(/gzip/)
  })

  it('fails gzip bytes stored without Content-Encoding (a browser gets gzip)', () => {
    const failure = check(
      META_PATH,
      stored(metadata, { layers: 1, contentEncoding: '' })
    )
    expect(failure).toMatch(/gzip/)
  })

  it('fails truncated JSON', () => {
    const text = JSON.stringify(programYearFile('2026-10-08'))
    const failure = check(PY_PATH, plain(text.slice(0, text.length / 2)))
    expect(failure).toMatch(/invalid JSON/)
  })
})

describe('checkObject — time-series shape', () => {
  it('fails a program-year file with no data points', () => {
    expect(check(PY_PATH, stored(programYearFile()))).toMatch(/no data points/)
  })

  it('fails a program-year file whose last point has no valid date', () => {
    const file = programYearFile('2026-10-08')
    file.dataPoints[0]!.date = '2026-02-30'
    expect(check(PY_PATH, stored(file))).toMatch(/invalid date/)
  })

  it('fails a last point older than the one production already serves', () => {
    const failure = check(
      PY_PATH,
      stored(programYearFile('2026-09-30')),
      CTX,
      stored(programYearFile('2026-09-30', '2026-10-08'))
    )
    expect(failure).toMatch(/2026-09-30.*2026-10-08/)
  })

  it('passes a last point equal to production (a no-new-point run)', () => {
    const failure = check(
      PY_PATH,
      stored(programYearFile('2026-10-08')),
      CTX,
      stored(programYearFile('2026-10-08'))
    )
    expect(failure).toBeNull()
  })

  it('does not compare against a production copy that is itself corrupt', () => {
    const failure = check(
      PY_PATH,
      stored(programYearFile('2026-10-08')),
      CTX,
      stored(programYearFile('2026-10-09'), { layers: 10 })
    )
    expect(failure).toBeNull()
  })

  it('fails an index-metadata file that does not match the schema', () => {
    expect(check(META_PATH, plain({ districtId: '61' }))).toMatch(/schema/)
  })
})

describe('checkObject — competitive-awards (#1704)', () => {
  it('passes when prior-year club sizes are present', () => {
    expect(check(AWARDS_PATH, plain(awards([20, null, 18])))).toBeNull()
  })

  it('fails when priorYearAvgClubSize is null for every district', () => {
    expect(check(AWARDS_PATH, plain(awards([null, null, null])))).toMatch(
      /priorYearAvgClubSize/
    )
  })

  it('fails when clubStrengthAward.allDistricts is missing or empty', () => {
    expect(check(AWARDS_PATH, plain(awards([])))).toMatch(/allDistricts/)
    expect(check(AWARDS_PATH, plain({ metadata: {} }))).toMatch(/allDistricts/)
  })

  it('allows all-null for an older program year (history may not reach back)', () => {
    const path = 'snapshots/2025-10-08/competitive-awards.json'
    expect(check(path, plain(awards([null, null])))).toBeNull()
  })

  it('allows all-null when the dataset has no prior-program-year dates', () => {
    const ctx = { ...CTX, availableDates: ['2026-09-30', '2026-10-08'] }
    expect(check(AWARDS_PATH, plain(awards([null, null])), ctx)).toBeNull()
  })
})

describe('checkObject — other shapes', () => {
  it('passes a district analytics file with metadata and data', () => {
    expect(check(ANALYTICS_PATH, plain(analytics))).toBeNull()
  })

  it('fails a district analytics file without data', () => {
    expect(
      check(ANALYTICS_PATH, plain({ metadata: analytics.metadata }))
    ).toMatch(/data/)
  })

  it('passes a valid snapshot index and latest manifest', () => {
    expect(
      check('config/district-snapshot-index.json', plain(snapshotIndex))
    ).toBeNull()
    expect(check('v1/latest.json', plain(latest('2026-10-08')))).toBeNull()
  })

  it('fails a latest manifest without a valid date', () => {
    expect(check('v1/latest.json', plain({ latestSnapshotDate: 'x' }))).toMatch(
      /latestSnapshotDate/
    )
  })
})

describe('checkLatestAgreesWithIndex', () => {
  it('passes when some district lists the latest date', () => {
    expect(
      checkLatestAgreesWithIndex(
        plain(latest('2026-10-08')),
        plain(snapshotIndex)
      )
    ).toBeNull()
  })

  it('fails when no district in the index lists the latest date', () => {
    expect(
      checkLatestAgreesWithIndex(
        plain(latest('2026-10-09')),
        plain(snapshotIndex)
      )
    ).toMatch(/2026-10-09/)
  })
})

describe('planContentChecks — bounded, change-driven sampling', () => {
  const meta = (name: string): GcsObjectMeta => ({ name, crc32c: 'x', size: 1 })

  it('checks every changed time-series district: metadata + newest program year', () => {
    const plan = planContentChecks(
      [
        meta('time-series/district_61/index-metadata.json'),
        meta('time-series/district_61/2025-2026.json'),
        meta('time-series/district_61/2026-2027.json'),
        meta('time-series/district_86/2026-2027.json'),
      ],
      { random: () => 0 }
    )
    const prodCompared = plan.checks
      .filter(c => c.compareWithProd)
      .map(c => c.path)
    expect(prodCompared.sort()).toEqual([
      'time-series/district_61/2026-2027.json',
      'time-series/district_86/2026-2027.json',
    ])
    expect(plan.checks.map(c => c.path)).toContain(
      'time-series/district_61/index-metadata.json'
    )
  })

  it('always checks latest and the snapshot index when either changed', () => {
    const plan = planContentChecks([meta('v1/latest.json')], {
      random: () => 0,
    })
    expect(plan.crossCheckLatest).toBe(true)
  })

  it('caps the generic sample, keeps D61, and skips non-JSON', () => {
    const changed = [
      meta('snapshots/2026-10-08/raw.csv'),
      meta('snapshots/2026-10-08/district_61.json'),
      ...Array.from({ length: 500 }, (_, i) =>
        meta(`snapshots/2026-10-08/district_${i + 100}.json`)
      ),
    ]
    const plan = planContentChecks(changed, {
      random: () => 0.5,
      caps: { generic: 50 },
    })
    expect(plan.checks).toHaveLength(50)
    expect(plan.checks.map(c => c.path)).toContain(
      'snapshots/2026-10-08/district_61.json'
    )
    expect(plan.notJson).toBe(1)
    expect(plan.sampledOut).toBe(451)
  })
})

describe('evaluateContentGate', () => {
  it('promotes when every check passes', () => {
    const r = evaluateContentGate({
      changedCount: 3,
      results: [
        { path: PY_PATH, kind: 'time-series-program-year', failure: null },
      ],
    })
    expect(r.promote).toBe(true)
    expect(r.failures).toEqual([])
  })

  it('holds when any check fails', () => {
    const r = evaluateContentGate({
      changedCount: 3,
      results: [
        {
          path: PY_PATH,
          kind: 'time-series-program-year',
          failure: 'still gzip',
        },
        { path: META_PATH, kind: 'time-series-metadata', failure: null },
      ],
    })
    expect(r.promote).toBe(false)
    expect(r.failures).toEqual([{ path: PY_PATH, reason: 'still gzip' }])
  })

  it('holds (fails closed) when the gate itself could not run', () => {
    const r = evaluateContentGate({
      changedCount: 0,
      results: [],
      error: 'listing failed',
    })
    expect(r.promote).toBe(false)
    expect(r.reason).toMatch(/listing failed/)
  })

  it('promotes an empty change set (nothing to copy, nothing to check)', () => {
    expect(evaluateContentGate({ changedCount: 0, results: [] }).promote).toBe(
      true
    )
  })

  it('summary lists the objects checked and what was asserted', () => {
    const summary = buildContentGateSummary(
      evaluateContentGate({
        changedCount: 1,
        results: [
          { path: PY_PATH, kind: 'time-series-program-year', failure: null },
        ],
      })
    )
    expect(summary).toContain(PY_PATH)
    expect(summary).toMatch(/last point/i)
  })
})
