/**
 * The local pipeline harness, end to end (#1768, ADR-015 step 10, P3-2).
 *
 * Each scenario seeds a fresh SHIM_ROOT (staging + prod, the fixture corpus
 * in scripts/lib/pipelineHarness.ts), runs one canonical mode the way
 * data-pipeline.yml sequences it — store sync → process-dates.sh →
 * store publish → completeness + content gates → promote-run-manifest.ts
 * --execute — and then reads back EVERY object in the prod bucket: bytes
 * and parsed shape, not the plan of operations (#1706).
 *
 * Runs in its own path-filtered CI job (.github/workflows/pipeline-harness.yml).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import {
  FIXTURE_DATES,
  HARNESS_DISTRICTS,
  HARNESS_PROD,
  HARNESS_STAGING,
  createWorld,
  gzipLayers,
  prodTwinViolations,
  readBucket,
  runPipeline,
  type BucketObject,
  type PipelineRun,
  type World,
} from '../../lib/pipelineHarness.js'

const { daily: D, historical: H } = FIXTURE_DATES

const tmps: string[] = []
afterAll(() => {
  for (const t of tmps) fs.rmSync(t, { recursive: true, force: true })
})

async function scenario(
  opts: Parameters<typeof runPipeline>[1],
  seed: Parameters<typeof createWorld>[1] = {}
): Promise<{
  world: World
  run: PipelineRun
  prodBefore: Map<string, BucketObject>
  stagingBefore: Map<string, BucketObject>
}> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-e2e-'))
  tmps.push(tmp)
  const world = createWorld(tmp, seed)
  const prodBefore = readBucket(world.root, HARNESS_PROD)
  const stagingBefore = readBucket(world.root, HARNESS_STAGING)
  const run = await runPipeline(world, opts)
  return { world, run, prodBefore, stagingBefore }
}

const decoded = (o: BucketObject): unknown =>
  JSON.parse(
    (o.contentEncoding === 'gzip'
      ? zlib.gunzipSync(o.bytes)
      : o.bytes
    ).toString('utf-8')
  )

const richestClub = (v: unknown): number =>
  Math.max(
    ...((v as { data: { clubs: object[] } }).data.clubs.map(
      c => Object.keys(c).length
    ) ?? [0])
  )

function expectUnchanged(
  before: Map<string, BucketObject>,
  after: Map<string, BucketObject>,
  prefix = ''
): void {
  const pick = (m: Map<string, BucketObject>) =>
    [...m.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, o]) => [k, o.bytes.toString('base64'), o.contentEncoding ?? ''])
  expect(pick(after)).toEqual(pick(before))
}

describe('daily (fixture date without persisted FAC; prod enriched, staging stripped)', () => {
  let s: Awaited<ReturnType<typeof scenario>>
  beforeAll(async () => {
    s = await scenario({ mode: 'daily', date: D })
  })

  it('promotes the date, and every prod object is a twin of staging or untouched', () => {
    expect(s.run.outcome, JSON.stringify(s.run.steps, null, 1)).toBe('promoted')
    expect(s.run.promoted.length).toBeGreaterThan(0)
    expect(prodTwinViolations(s.world, s.prodBefore, s.run.promoted)).toEqual(
      []
    )
  })

  it('prod now serves the daily’s FAC-enriched records for every district', () => {
    const prod = readBucket(s.world.root, HARNESS_PROD)
    for (const id of HARNESS_DISTRICTS) {
      const o = prod.get(`snapshots/${D}/district_${id}.json`)!
      const v = decoded(o) as { districtId: string }
      expect(v.districtId).toBe(id)
      expect(richestClub(v)).toBe(28)
      expect(s.run.promoted).toContain(`snapshots/${D}/district_${id}.json`)
      expect(s.run.promoted).toContain(
        `snapshots/${D}/analytics/district_${id}_analytics.json`
      )
    }
  })

  it('persists the day’s FAC to staging raw-fac/ and never promotes internal state', () => {
    const staging = readBucket(s.world.root, HARNESS_STAGING)
    for (const id of HARNESS_DISTRICTS) {
      expect(staging.has(`raw-fac/${D}/district_${id}.json`)).toBe(true)
    }
    const prodKeys = [...readBucket(s.world.root, HARNESS_PROD).keys()]
    expect(
      prodKeys.filter(k =>
        /^(raw-csv|raw-fac|club-trends|club-race|runs)\//.test(k)
      )
    ).toEqual([])
  })

  it('leaves the other date in prod byte-for-byte', () => {
    expectUnchanged(
      s.prodBefore,
      readBucket(s.world.root, HARNESS_PROD),
      `snapshots/${H}/`
    )
  })

  it('pushes the two-layer club-trends object back as plain JSON (#1702)', () => {
    const o = readBucket(s.world.root, HARNESS_STAGING).get(
      'club-trends/2026-2027/district_61.json'
    )!
    expect(gzipLayers(o.bytes)).toBe(0)
    expect(o.contentEncoding).toBeUndefined()
    expect(() => JSON.parse(o.bytes.toString('utf-8'))).not.toThrow()
  })
})

describe('subset rescrape of the FAC-persisted date with one district’s raw missing (#1756)', () => {
  let s: Awaited<ReturnType<typeof scenario>>
  beforeAll(async () => {
    s = await scenario({ mode: 'rescrape', date: H, districts: '61' })
  })

  it('promotes, and every prod object is a twin of staging or untouched', () => {
    expect(s.run.outcome, JSON.stringify(s.run.steps, null, 1)).toBe('promoted')
    expect(s.run.promoted).toContain(`snapshots/${H}/district_61.json`)
    expect(prodTwinViolations(s.world, s.prodBefore, s.run.promoted)).toEqual(
      []
    )
  })

  it('keeps every district of the date in prod, enriched, including the one with no raw', () => {
    const prod = readBucket(s.world.root, HARNESS_PROD)
    for (const id of HARNESS_DISTRICTS) {
      expect(
        richestClub(decoded(prod.get(`snapshots/${H}/district_${id}.json`)!))
      ).toBe(28)
    }
    const meta = decoded(prod.get(`snapshots/${H}/metadata.json`)!) as {
      successfulDistricts: string[]
    }
    expect([...meta.successfulDistricts].sort()).toEqual(
      [...HARNESS_DISTRICTS].sort()
    )
  })

  it('never rewrites the hydrated districts’ staged objects (I-2)', () => {
    const staging = readBucket(s.world.root, HARNESS_STAGING)
    for (const id of ['02', '201']) {
      const p = `snapshots/${H}/district_${id}.json`
      expect(staging.get(p)!.bytes.equals(s.stagingBefore.get(p)!.bytes)).toBe(
        true
      )
    }
  })
})

describe('subset rescrape of a date staging holds stripped (D-1, #1758)', () => {
  let s: Awaited<ReturnType<typeof scenario>>
  beforeAll(async () => {
    s = await scenario({ mode: 'rescrape', date: D, districts: '61' })
  })

  it('the completeness gate holds the date and prod is untouched, byte for byte', () => {
    expect(s.run.outcome, JSON.stringify(s.run.steps, null, 1)).toBe('held')
    expect(s.run.completeness?.heldDates).toEqual([D])
    expect(s.run.promoted).toEqual([])
    expectUnchanged(s.prodBefore, readBucket(s.world.root, HARNESS_PROD))
  })
})

describe('rescrape-historical of the prior PY’s close', () => {
  let s: Awaited<ReturnType<typeof scenario>>
  beforeAll(async () => {
    s = await scenario({ mode: 'rescrape-historical', date: H })
  })

  it('promotes, and every prod object is a twin of staging or untouched', () => {
    expect(s.run.outcome, JSON.stringify(s.run.steps, null, 1)).toBe('promoted')
    expect(prodTwinViolations(s.world, s.prodBefore, s.run.promoted)).toEqual(
      []
    )
    for (const id of HARNESS_DISTRICTS) {
      expect(s.run.promoted).toContain(`snapshots/${H}/district_${id}.json`)
    }
  })

  it('uploads the historical raw to staging, never to prod', () => {
    const staging = readBucket(s.world.root, HARNESS_STAGING)
    expect(staging.has(`raw-csv/${H}/district-201/club-performance.csv`)).toBe(
      true
    )
    expect(
      [...readBucket(s.world.root, HARNESS_PROD).keys()].some(k =>
        k.startsWith('raw-csv/')
      )
    ).toBe(false)
  })

  it('leaves the current date in prod byte-for-byte', () => {
    expectUnchanged(
      s.prodBefore,
      readBucket(s.world.root, HARNESS_PROD),
      `snapshots/${D}/`
    )
  })
})

describe('a truncated store object (#1702 class)', () => {
  let s: Awaited<ReturnType<typeof scenario>>
  beforeAll(async () => {
    s = await scenario({ mode: 'daily', date: D }, { truncatedStore: true })
  })

  it('fails closed at the store sync: nothing is written to staging or prod', () => {
    expect(s.run.outcome).toBe('failed')
    expect(s.run.failedStep).toBe('sync-stores')
    expectUnchanged(s.prodBefore, readBucket(s.world.root, HARNESS_PROD))
    expectUnchanged(s.stagingBefore, readBucket(s.world.root, HARNESS_STAGING))
  })
})
