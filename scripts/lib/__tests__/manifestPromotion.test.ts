/**
 * Scoped promotion planner (#1763, ADR-015 P6, migration step 5).
 *
 * Promotion copies exactly the run manifest's objects under the promoted
 * prefixes, for the dates the completeness gate passed. These pin the
 * design decisions the plan encodes:
 *  - date-scoped (`snapshots/<date>/…`) vs global (`v1/`, `config/`,
 *    `time-series/`) objects;
 *  - a held date holds itself AND every global object, because the globals
 *    are aggregates over every staged date, the held one included;
 *  - globals also hold when staging's date index names a date prod lacks
 *    and this run does not promote (no dangling index entries in prod);
 *  - internal paths (stores, raw inputs, derived/) are never promoted;
 *  - copy order: dates, then globals, then the v1/ entry points last.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  ENTRY_POINT_PATHS,
  MAX_SOURCES_PER_COPY,
  classifyPromotionPath,
  formatPromotionPlan,
  parseIndexDates,
  parseSnapshotDateListing,
  planManifestPromotion,
  resolveHeldDates,
  type PromotionInputs,
} from '../manifestPromotion.js'
import {
  parseRunManifest,
  parseRunRemovals,
  type RunManifestEntry,
  type RunRemovalEntry,
} from '../runManifest.js'
import { PROMOTED_PREFIXES } from '../promotionContentGate.js'

const FIXTURE = path.resolve(
  process.cwd(),
  'scripts/lib/__tests__/fixtures/manifest-promotion/written-38264180225.jsonl'
)
const recorded = parseRunManifest(fs.readFileSync(FIXTURE, 'utf-8'))

const SHA = 'b'.repeat(64)
const entry = (p: string): RunManifestEntry => ({
  path: p,
  sha256: SHA,
  date: /^snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(p)?.[1] ?? null,
  stage: 'test',
})

const pass = { promote: true } as const
const inputs = (over: Partial<PromotionInputs> = {}): PromotionInputs => ({
  entries: recorded,
  held: resolveHeldDates(pass),
  indexDates: ['2026-10-10', '2026-10-11'],
  prodDates: new Set(['2026-10-10', '2026-10-11']),
  ...over,
})
const copied = (plan: ReturnType<typeof planManifestPromotion>) =>
  plan.batches.flatMap(b => b.paths)

describe('classifyPromotionPath', () => {
  it('dates snapshots/<date>/ objects, including nested analytics', () => {
    expect(
      classifyPromotionPath('snapshots/2026-10-11/district_61.json')
    ).toEqual({ kind: 'date', date: '2026-10-11' })
    expect(
      classifyPromotionPath(
        'snapshots/2026-10-11/analytics/district_61_analytics.json'
      )
    ).toEqual({ kind: 'date', date: '2026-10-11' })
  })

  it('treats v1/, config/ and time-series/ as global', () => {
    for (const p of [
      'v1/latest.json',
      'v1/rank-history/61.json',
      'config/district-snapshot-index.json',
      'time-series/district_61/2026-2027.json',
    ]) {
      expect(classifyPromotionPath(p), p).toEqual({ kind: 'global' })
    }
  })

  it('never promotes internal paths: stores, raw inputs, derived/, runs/', () => {
    for (const p of [
      'club-trends/2026-2027/district_01.json',
      'club-race/2026-2027/first-reached.json',
      'district-awards-history.json',
      'raw-csv/2026-10-11/all-districts.csv',
      'raw-fac/2026-10-11/district_61.json',
      'derived/district-region-history.json',
      'derived/club-district-history/00.json',
      'runs/38264180225/written.jsonl',
    ]) {
      expect(classifyPromotionPath(p).kind, p).toBe('excluded')
    }
  })

  it('uses the content gate allow-list, so every promoted object was gate-read', () => {
    for (const prefix of PROMOTED_PREFIXES) {
      const p =
        prefix === 'snapshots/'
          ? `${prefix}2026-10-11/x.json`
          : `${prefix}x.json`
      expect(classifyPromotionPath(p).kind, p).not.toBe('excluded')
    }
  })

  it('becomes promotable the moment an identity artifact is written under config/', () => {
    // The follow-up to #1782/#1820 moves the writer, not the promoter:
    // staging path == prod path, no rename layer.
    expect(
      classifyPromotionPath('config/club-district-history/00.json')
    ).toEqual({ kind: 'global' })
  })

  it.each([
    ['an undated snapshots/ object', 'snapshots/stray.json'],
    ['a parent segment', 'v1/../club-trends/x.json'],
    ['a wildcard gcloud would expand', 'snapshots/2026-10-11/district_*.json'],
    ['a leading slash', '/v1/latest.json'],
    ['an empty segment', 'v1//latest.json'],
    ['whitespace', 'v1/latest .json'],
  ])('refuses %s (fail closed: the recording broke)', (_, p) => {
    expect(() => classifyPromotionPath(p)).toThrow()
  })
})

describe('resolveHeldDates (the completeness gate verdict)', () => {
  it('holds nothing on a pass, including an allow_value_changes override', () => {
    expect(resolveHeldDates({ promote: true })).toEqual({
      all: false,
      dates: [],
    })
    expect(
      resolveHeldDates({ promote: true, heldDates: ['2026-10-11'] })
    ).toEqual({ all: false, dates: [] })
  })

  it('holds the named dates on a per-date hold', () => {
    expect(
      resolveHeldDates({ promote: false, heldDates: ['2026-10-11'] })
    ).toEqual({ all: false, dates: ['2026-10-11'] })
  })

  it('holds everything when the gate failed without naming dates (it could not run)', () => {
    expect(resolveHeldDates({ promote: false }).all).toBe(true)
    expect(resolveHeldDates({ promote: false, heldDates: [] }).all).toBe(true)
    expect(resolveHeldDates(null).all).toBe(true)
  })
})

describe('planManifestPromotion', () => {
  it('promotes every gate-read object of a clean run and nothing internal', () => {
    const plan = planManifestPromotion(inputs())
    expect(plan.globals.promote).toBe(true)
    expect(plan.promotedDates).toEqual(['2026-10-11'])
    expect(copied(plan).sort()).toEqual(
      [
        'snapshots/2026-10-11/district_F.json',
        'snapshots/2026-10-11/manifest.json',
        'snapshots/2026-10-11/all-districts-rankings.json',
        'snapshots/2026-10-11/district_61.json',
        'snapshots/2026-10-11/analytics/district_61_analytics.json',
        'time-series/district_61/2026-2027.json',
        'v1/latest.json',
        'v1/dates.json',
        'v1/rankings.json',
        'v1/rank-history/61.json',
        'v1/global-history.json',
        'config/district-snapshot-index.json',
        'config/club-index.json',
        'config/divisions-areas-index.json',
      ].sort()
    )
    expect(plan.excluded.map(e => e.path)).toContain(
      'derived/district-region-history.json'
    )
    expect(plan.excluded.map(e => e.path)).toContain(
      'district-awards-history.json'
    )
    expect(plan.objectCount).toBe(14)
  })

  it('copies dates first, globals next, the v1/ entry points last', () => {
    const plan = planManifestPromotion(inputs())
    const phases = plan.batches.map(b => b.phase)
    expect(phases).toEqual([...phases].sort(phaseOrder))
    const last = plan.batches[plan.batches.length - 1]!
    expect(last.phase).toBe('entry')
    expect([...last.paths].sort()).toEqual([...ENTRY_POINT_PATHS].sort())
    expect(
      plan.batches.filter(b => b.phase !== 'entry').flatMap(b => b.paths)
    ).not.toContain('v1/latest.json')
  })

  it('copies the club-district history index after all 100 of its shards (#1782)', () => {
    const dir = 'config/club-district-history/'
    const shards = Array.from(
      { length: 100 },
      (_, i) => `${dir}${String(i).padStart(2, '0')}.json`
    )
    const plan = planManifestPromotion(
      inputs({
        entries: [...recorded, ...shards.map(entry), entry(`${dir}index.json`)],
      })
    )
    const at = (p: string) => plan.batches.findIndex(b => b.paths.includes(p))
    const indexBatch = plan.batches[at(`${dir}index.json`)]!
    expect(indexBatch.phase).toBe('entry')
    expect(indexBatch.paths).toEqual([`${dir}index.json`])
    for (const s of shards) {
      expect(plan.batches[at(s)]!.phase, s).toBe('globals')
      expect(at(s), s).toBeLessThan(at(`${dir}index.json`))
    }
    // The shards share one cp (100 sources, under the per-call cap); the
    // v1/ entry points still go last.
    expect(new Set(shards.map(at)).size).toBe(1)
    expect(plan.batches.at(-1)!.paths.sort()).toEqual(
      [...ENTRY_POINT_PATHS].sort()
    )
    expect(plan.objectCount).toBe(14 + 101)
  })

  it('holds the club-district history with the other globals when a date is held', () => {
    const dir = 'config/club-district-history/'
    const plan = planManifestPromotion(
      inputs({
        entries: [
          ...recorded,
          entry(`${dir}77.json`),
          entry(`${dir}index.json`),
        ],
        held: resolveHeldDates({ promote: false, heldDates: ['2026-10-11'] }),
      })
    )
    expect(copied(plan)).not.toContain(`${dir}77.json`)
    expect(copied(plan)).not.toContain(`${dir}index.json`)
    expect(plan.held.map(h => h.path)).toEqual(
      expect.arrayContaining([`${dir}77.json`, `${dir}index.json`])
    )
  })

  it('batches by destination directory so every object keeps its path', () => {
    const plan = planManifestPromotion(inputs())
    for (const b of plan.batches) {
      for (const p of b.paths) expect(path.posix.dirname(p) + '/').toBe(b.dir)
      expect(b.paths.length).toBeLessThanOrEqual(MAX_SOURCES_PER_COPY)
    }
    const many = Array.from({ length: MAX_SOURCES_PER_COPY + 3 }, (_, i) =>
      entry(`snapshots/2026-10-11/analytics/d_${i}.json`)
    )
    const big = planManifestPromotion(inputs({ entries: many }))
    expect(big.batches.map(b => b.paths.length)).toEqual([
      MAX_SOURCES_PER_COPY,
      3,
    ])
  })

  it('promotes only the passing date when the gate holds the other — and holds the globals', () => {
    const entries = [
      entry('snapshots/2026-10-10/district_61.json'),
      entry('snapshots/2026-10-11/district_61.json'),
      entry('time-series/district_61/2026-2027.json'),
      entry('v1/dates.json'),
      entry('config/district-snapshot-index.json'),
    ]
    const plan = planManifestPromotion(
      inputs({
        entries,
        held: resolveHeldDates({ promote: false, heldDates: ['2026-10-10'] }),
      })
    )
    expect(copied(plan)).toEqual(['snapshots/2026-10-11/district_61.json'])
    expect(plan.promotedDates).toEqual(['2026-10-11'])
    expect(plan.heldDates).toEqual(['2026-10-10'])
    expect(plan.globals.promote).toBe(false)
    expect(plan.globals.reason).toContain('2026-10-10')
    expect(plan.globals.paths).toEqual([
      'config/district-snapshot-index.json',
      'time-series/district_61/2026-2027.json',
      'v1/dates.json',
    ])
  })

  it('holds the globals when staging indexes a date prod lacks and this run does not promote', () => {
    const plan = planManifestPromotion(
      inputs({
        indexDates: ['2026-10-09', '2026-10-10', '2026-10-11'],
        prodDates: new Set(['2026-10-10']),
      })
    )
    // 2026-10-11 is promoted by this run; 2026-10-09 would dangle.
    expect(plan.globals.promote).toBe(false)
    expect(plan.globals.reason).toContain('2026-10-09')
    expect(plan.globals.reason).not.toContain('2026-10-11')
    expect(plan.promotedDates).toEqual(['2026-10-11'])
    expect(copied(plan).every(p => p.startsWith('snapshots/'))).toBe(true)
  })

  it('holds the globals when the index or prod listing could not be read', () => {
    expect(
      planManifestPromotion(inputs({ indexDates: null })).globals.promote
    ).toBe(false)
    expect(
      planManifestPromotion(inputs({ prodDates: null })).globals.promote
    ).toBe(false)
  })

  it('copies nothing when the completeness verdict is unavailable', () => {
    const plan = planManifestPromotion(inputs({ held: resolveHeldDates(null) }))
    expect(plan.batches).toEqual([])
    expect(plan.objectCount).toBe(0)
    expect(plan.heldAll).toBeTruthy()
  })

  it('takes the last write of a path once', () => {
    const plan = planManifestPromotion(
      inputs({
        entries: [entry('v1/latest.json'), entry('v1/latest.json')],
        indexDates: [],
      })
    )
    expect(copied(plan)).toEqual(['v1/latest.json'])
  })

  it('is deterministic, so a re-run plans the same copies', () => {
    const shuffled = [...recorded].reverse()
    expect(planManifestPromotion(inputs({ entries: shuffled }))).toEqual(
      planManifestPromotion(inputs())
    )
  })

  it('never plans a delete: objects absent from the manifest are not touched', () => {
    const plan = planManifestPromotion(inputs())
    expect(JSON.stringify(plan)).not.toMatch(/"(rm|delete)"/)
  })
})

describe('index and listing parsers', () => {
  it('reads v1/dates.json and v1/latest.json in their recorded shapes', () => {
    const dates = JSON.stringify({
      _format: { version: '1.0.0', type: 'dates-index' },
      dates: ['2017-01-31', '2026-10-11'],
    })
    const latest = JSON.stringify({
      _format: { version: '1.0.0', type: 'manifest' },
      latestSnapshotDate: '2026-10-12',
      generatedAt: '2026-10-12T09:06:52.939Z',
    })
    expect(parseIndexDates(dates, latest)).toEqual([
      '2017-01-31',
      '2026-10-11',
      '2026-10-12',
    ])
    expect(() => parseIndexDates('{"dates":"x"}', latest)).toThrow()
  })

  it('reads the date directories of a `gcloud storage ls gs://b/snapshots/` listing', () => {
    const ls = [
      'gs://toast-stats-data-ca/snapshots/2017-01-31/',
      'gs://toast-stats-data-ca/snapshots/2026-10-11/',
      '',
    ].join('\n')
    expect([...parseSnapshotDateListing(ls)]).toEqual([
      '2017-01-31',
      '2026-10-11',
    ])
  })
})

describe('formatPromotionPlan (the dry run)', () => {
  it('lists every copy as src → dst, and every exclusion with its reason', () => {
    const plan = planManifestPromotion(inputs())
    const text = formatPromotionPlan(plan, 'stg', 'prod')
    const copies = text.split('\n').filter(l => l.startsWith('copy\t'))
    expect(copies).toHaveLength(plan.objectCount)
    expect(copies).toContain(
      'copy\tdates\tgs://stg/snapshots/2026-10-11/district_61.json\tgs://prod/snapshots/2026-10-11/district_61.json'
    )
    expect(text).toMatch(/^skip\tderived\/district-region-history\.json\t/m)
  })
})

function phaseOrder(a: string, b: string): number {
  const order = ['dates', 'globals', 'entry']
  return order.indexOf(a) - order.indexOf(b)
}

/**
 * The prune reconcile's deletes (#1767, ADR-015 step 9): the delete plan
 * (scripts/prune-prod-reconcile.ts) goes through the same promoter, after
 * the regenerated indexes, so prod's index never names a deleted date.
 */
describe('planManifestPromotion: prune reconcile deletes (#1767)', () => {
  // What a prune run writes: the regenerated indexes, and no dated object.
  const pruneEntries = [
    'v1/latest.json',
    'v1/dates.json',
    'v1/rankings.json',
    'config/district-snapshot-index.json',
    'config/club-index.json',
  ].map(entry)
  const DELETES = ['snapshots/2026-09-15', 'raw-csv/2026-09-15']
  const prune = (over: Partial<PromotionInputs> = {}): PromotionInputs => ({
    entries: pruneEntries,
    held: resolveHeldDates(pass),
    indexDates: ['2026-08-31', '2026-09-30'],
    prodDates: new Set(['2026-08-31', '2026-09-15', '2026-09-30']),
    deletes: DELETES,
    ...over,
  })

  it('plans the deletes, sorted, once the regenerated indexes promote', () => {
    const plan = planManifestPromotion(prune())
    expect(plan.globals.promote).toBe(true)
    expect(plan.deletes).toEqual({
      promote: true,
      reason: expect.any(String),
      paths: ['raw-csv/2026-09-15', 'snapshots/2026-09-15'],
    })
    // Deletes are not copies.
    expect(copied(plan)).not.toContain('snapshots/2026-09-15')
    expect(plan.objectCount).toBe(5)
  })

  it('plans no deletes when none are requested (every other mode)', () => {
    const plan = planManifestPromotion(inputs())
    expect(plan.deletes.paths).toEqual([])
    expect(plan.deletes.promote).toBe(false)
  })

  it('holds the deletes when the globals hold: the old index still names them', () => {
    const plan = planManifestPromotion(prune({ indexDates: null }))
    expect(plan.globals.promote).toBe(false)
    expect(plan.deletes.promote).toBe(false)
    expect(plan.deletes.reason).toMatch(/index/)
  })

  it('holds the deletes when the run did not write the v1/ entry points', () => {
    const plan = planManifestPromotion(
      prune({ entries: [entry('config/district-snapshot-index.json')] })
    )
    expect(plan.deletes.promote).toBe(false)
    expect(plan.deletes.reason).toContain('v1/dates.json')
  })

  it("holds the globals and the deletes when staging's index still names a deleted date", () => {
    const plan = planManifestPromotion(
      prune({ indexDates: ['2026-08-31', '2026-09-15', '2026-09-30'] })
    )
    expect(plan.globals.promote).toBe(false)
    expect(plan.globals.reason).toContain('2026-09-15')
    expect(plan.deletes.promote).toBe(false)
  })

  it.each([
    ['a derived layer', 'v1/rank-history'],
    ['an object, not a dated prefix', 'snapshots/2026-09-15/district_61.json'],
    ['a store', 'club-trends/2026-2027'],
    ['a wildcard', 'snapshots/2026-09-*'],
  ])('refuses %s', (_label, bad) => {
    expect(() => planManifestPromotion(prune({ deletes: [bad] }))).toThrow(
      /scope/
    )
  })

  it('refuses to delete a date the run also writes', () => {
    expect(() =>
      planManifestPromotion(
        prune({
          entries: [
            ...pruneEntries,
            entry('snapshots/2026-09-15/district_61.json'),
          ],
        })
      )
    ).toThrow(/2026-09-15/)
  })

  it('lists the deletes in the dry run, after every copy', () => {
    const text = formatPromotionPlan(
      planManifestPromotion(prune()),
      'stg',
      'prod'
    )
    const lines = text.split('\n').filter(Boolean)
    expect(lines.filter(l => l.startsWith('delete\t'))).toEqual([
      'delete\tgs://prod/raw-csv/2026-09-15/',
      'delete\tgs://prod/snapshots/2026-09-15/',
    ])
    const lastCopy = lines.map(l => l.startsWith('copy\t')).lastIndexOf(true)
    expect(lines.findIndex(l => l.startsWith('delete\t'))).toBeGreaterThan(
      lastCopy
    )
  })

  it('lists held deletes as holds, with the reason', () => {
    const text = formatPromotionPlan(
      planManifestPromotion(prune({ indexDates: null })),
      'stg',
      'prod'
    )
    expect(text).not.toMatch(/^delete\t/m)
    expect(text).toMatch(/^hold\tsnapshots\/2026-09-15\/\t/m)
  })
})

describe('planManifestPromotion: removals of a failed district (#2232)', () => {
  // A rebuild re-derived two dates and removed district U's earlier
  // per-date objects from staging on each (runs/<id>/removed.jsonl).
  const runEntries = [
    'snapshots/2018-06-30/metadata.json',
    'snapshots/2018-06-30/district_61.json',
    'snapshots/2019-06-30/metadata.json',
    'snapshots/2019-06-30/district_61.json',
  ].map(entry)
  const removal = (p: string): RunRemovalEntry => ({
    path: p,
    date: /^snapshots\/(\d{4}-\d{2}-\d{2})\//.exec(p)?.[1] ?? null,
    stage: 'process-dates:rebuild',
  })
  const REMOVALS = [
    'snapshots/2019-06-30/district_U.json',
    'snapshots/2018-06-30/district_U_reports.json',
    'snapshots/2018-06-30/analytics/district_U_analytics.json',
    'snapshots/2018-06-30/district_U.json',
  ].map(removal)
  const rebuild = (over: Partial<PromotionInputs> = {}): PromotionInputs => ({
    entries: runEntries,
    held: resolveHeldDates(pass),
    indexDates: ['2018-06-30', '2019-06-30'],
    prodDates: new Set(['2018-06-30', '2019-06-30']),
    removals: REMOVALS,
    ...over,
  })
  const held2018 = () =>
    resolveHeldDates({ promote: false, heldDates: ['2018-06-30'] })

  it('plans every removal of a promoted date, sorted, and copies none of them', () => {
    const plan = planManifestPromotion(rebuild())
    expect(plan.removals.paths).toEqual([
      'snapshots/2018-06-30/analytics/district_U_analytics.json',
      'snapshots/2018-06-30/district_U.json',
      'snapshots/2018-06-30/district_U_reports.json',
      'snapshots/2019-06-30/district_U.json',
    ])
    expect(plan.removals.held).toEqual([])
    for (const r of REMOVALS) expect(copied(plan)).not.toContain(r.path)
  })

  it('holds the removals of a held date with it: prod keeps that date whole', () => {
    const plan = planManifestPromotion(rebuild({ held: held2018() }))
    expect(plan.removals.paths).toEqual([
      'snapshots/2019-06-30/district_U.json',
    ])
    expect(plan.removals.held.map(h => h.path)).toEqual([
      'snapshots/2018-06-30/analytics/district_U_analytics.json',
      'snapshots/2018-06-30/district_U.json',
      'snapshots/2018-06-30/district_U_reports.json',
    ])
    expect(plan.removals.held[0]!.reason).toMatch(/2018-06-30 held/)
  })

  it('holds the removals while the globals hold: an index must not outlive them', () => {
    const plan = planManifestPromotion(
      rebuild({
        entries: [...runEntries, entry('config/district-snapshot-index.json')],
        indexDates: null,
      })
    )
    expect(plan.globals.promote).toBe(false)
    expect(plan.removals.paths).toEqual([])
    expect(plan.removals.held).toHaveLength(REMOVALS.length)
  })

  it('holds every removal when the gate gave no per-date verdict', () => {
    const plan = planManifestPromotion(
      rebuild({ held: resolveHeldDates(null) })
    )
    expect(plan.removals.paths).toEqual([])
    expect(plan.removals.held).toHaveLength(REMOVALS.length)
  })

  it('plans no removals when none were recorded (every other run)', () => {
    const plan = planManifestPromotion(inputs())
    expect(plan.removals).toEqual({ paths: [], held: [] })
  })

  it.each([
    ['a date-level object', 'snapshots/2018-06-30/metadata.json'],
    ['an undated object', 'v1/rank-history/U.json'],
    ['a prefix', 'snapshots/2018-06-30'],
    ['a wildcard', 'snapshots/2018-06-30/district_*.json'],
    ['a club shard', 'snapshots/2018-06-30/clubs-by-region/05.json'],
  ])('refuses to remove %s: only per-district objects', (_label, bad) => {
    expect(() =>
      planManifestPromotion(rebuild({ removals: [removal(bad)] }))
    ).toThrow(/refusing to remove/)
  })

  it('refuses a removal on a date the run did not write: it has no gate verdict', () => {
    expect(() =>
      planManifestPromotion(
        rebuild({
          removals: [removal('snapshots/2020-06-30/district_U.json')],
        })
      )
    ).toThrow(/2020-06-30/)
  })

  it('refuses to remove an object the run also writes', () => {
    expect(() =>
      planManifestPromotion(
        rebuild({
          removals: [removal('snapshots/2018-06-30/district_61.json')],
        })
      )
    ).toThrow(/both writes and removes/)
  })

  it('lists the removals in the dry run after every copy, and held ones as holds', () => {
    const plan = planManifestPromotion(rebuild({ held: held2018() }))
    const lines = formatPromotionPlan(plan, 'stg', 'prod')
      .split('\n')
      .filter(Boolean)
    expect(lines.filter(l => l.startsWith('remove\t'))).toEqual([
      'remove\tgs://prod/snapshots/2019-06-30/district_U.json',
    ])
    const lastCopy = lines.map(l => l.startsWith('copy\t')).lastIndexOf(true)
    expect(lines.findIndex(l => l.startsWith('remove\t'))).toBeGreaterThan(
      lastCopy
    )
    expect(lines).toContainEqual(
      expect.stringMatching(/^hold\tsnapshots\/2018-06-30\/district_U\.json\t/)
    )
  })
})

describe('parseRunRemovals (#2232)', () => {
  it('parses the removal lines; an empty file is no removals', () => {
    expect(parseRunRemovals('')).toEqual([])
    expect(
      parseRunRemovals(
        '{"path":"snapshots/2018-06-30/district_U.json","date":"2018-06-30","stage":"s"}\n'
      )
    ).toEqual([
      {
        path: 'snapshots/2018-06-30/district_U.json',
        date: '2018-06-30',
        stage: 's',
      },
    ])
  })

  it('throws on a malformed line, naming it', () => {
    expect(() => parseRunRemovals('{"path":""}\n')).toThrow(/line 1/)
    expect(() => parseRunRemovals('nope\n')).toThrow(/line 1/)
  })
})
