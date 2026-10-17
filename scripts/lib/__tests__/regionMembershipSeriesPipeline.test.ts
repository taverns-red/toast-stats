/**
 * time-series/regions/{PY}.json in the pipeline (#2127).
 *
 * compute-analytics writes it inside the synced time-series store, so
 * publish-stores.sh uploads it (changed files only) and records it in the
 * run manifest, and promotion copies it with time-series/ (a global object
 * for scoped promotion). The contracts pinned here:
 *   1. the content gate gives it its own kind, always checked, never
 *      sampled out: schema, the path's program year, every date inside that
 *      year (the #1284 slip), world = Σ regions, each district in one region;
 *   2. it is promoted as a global object under time-series/;
 *   3. every mode that runs compute-analytics syncs the whole time-series
 *      store and the region history before compute and publishes
 *      time-series after it — the series is derived from those files.
 *
 * The CDN schema canary is deliberately NOT extended: the object is not on
 * prod yet, and a canary would alert before its first promotion (#2008).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { RegionMembershipSeries } from '@taverns-red/shared-contracts'
import { classifyPromotionPath } from '../manifestPromotion.js'
import {
  checkObject,
  classifyObject,
  planContentChecks,
  type CheckContext,
  type StoredObject,
} from '../promotionContentGate.js'

const REPO = process.cwd()
const PATH = 'time-series/regions/2025-2026.json'
const RECORDED = JSON.parse(
  readFileSync(
    path.join(
      REPO,
      'packages/shared-contracts/src/__tests__/__fixtures__/recorded-region-membership-series.json'
    ),
    'utf-8'
  )
) as RegionMembershipSeries

const CTX: CheckContext = {
  latestSnapshotDate: '2026-10-12',
  availableDates: ['2026-06-30', '2026-10-12'],
  clubHistoryShards: { staging: [], prod: [] },
}

const plain = (value: unknown): StoredObject => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
})

const check = (p: string, value: unknown) =>
  checkObject({ path: p, kind: classifyObject(p)! }, plain(value), null, CTX)

describe('content gate: region-membership-series (#2127)', () => {
  it('is its own kind, apart from a district’s program-year file', () => {
    expect(classifyObject(PATH)).toBe('region-membership-series')
    expect(classifyObject('time-series/district_61/2025-2026.json')).toBe(
      'time-series-program-year'
    )
    expect(classifyObject('time-series/regions/index.json')).toBe('json')
  })

  it('is always checked, never sampled out', () => {
    const meta = (name: string) => ({ name, size: 1 })
    const plan = planContentChecks(
      [
        ...Array.from({ length: 20 }, (_, i) =>
          meta(`snapshots/2026-06-30/district_${i + 100}.json`)
        ),
        meta(PATH),
        meta('time-series/regions/2026-2027.json'),
      ],
      { random: () => 0, caps: { generic: 0, timeSeriesDistricts: 0 } }
    )
    expect(plan.checks.map(c => c.path).sort()).toEqual([
      PATH,
      'time-series/regions/2026-2027.json',
    ])
  })

  it('passes the recorded artifact', () => {
    expect(check(PATH, RECORDED)).toBeNull()
  })

  it('fails an artifact that breaks the shared-contracts schema', () => {
    expect(check(PATH, { ...RECORDED, world: { districts: 1 } })).toMatch(
      /schema/
    )
  })

  it('fails an artifact served under another program year', () => {
    expect(check('time-series/regions/2026-2027.json', RECORDED)).toMatch(
      /2025-2026.*2026-2027|2026-2027.*2025-2026/
    )
  })

  it('fails a date outside the file’s program year (the July-collection slip)', () => {
    const bad = structuredClone(RECORDED)
    bad.dates[bad.dates.length - 1] = '2026-07-25'
    expect(check(PATH, bad)).toMatch(/2026-07-25/)
  })

  it('fails dates out of order or repeated', () => {
    const bad = structuredClone(RECORDED)
    bad.dates[1] = bad.dates[0]!
    expect(check(PATH, bad)).toMatch(/ascending/)
  })

  it('fails a world value that is not the sum of the regions', () => {
    const bad = structuredClone(RECORDED)
    // A world with every region measured at a date must equal their sum.
    delete bad.regions!['05']
    bad.world.districts = 5
    bad.world.membership = [...bad.regions!['09']!.membership]
    expect(check(PATH, bad)).toBeNull()
    bad.world.membership[0] = bad.world.membership[0]! + 1
    expect(check(PATH, bad)).toMatch(/world/)
  })

  it('fails a world value where a region is null (a gap summed as 0)', () => {
    const bad = structuredClone(RECORDED)
    bad.world.membership[0] = 1
    expect(check(PATH, bad)).toMatch(/world/)
  })

  it('fails a district listed in two regions', () => {
    const bad = structuredClone(RECORDED)
    bad.regions!['05']!.districtIds = ['31', '61', '75']
    expect(check(PATH, bad)).toMatch(/75/)
  })
})

describe('promotion: region-membership-series moves with time-series/ (#2127)', () => {
  it('is a global object under a promoted prefix', () => {
    expect(classifyPromotionPath(PATH)).toEqual({ kind: 'global' })
  })
})

describe('data-pipeline.yml: the series is derived from synced inputs (#2127)', () => {
  const workflow = parseYaml(
    readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as {
    jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
  }
  const steps = workflow.jobs['pipeline']!.steps ?? []
  // One sync-stores.sh call (with its continuation lines) naming both.
  const SYNC_INPUTS =
    /sync-stores\.sh(?:[^\n]*\\\n)*[^\n]*\btime-series\b(?:[^\n]*\\\n)*[^\n]*district-region-history/
  const COMPUTE = /collector-cli compute-analytics|process-dates\.sh/
  const PUBLISH = /publish-stores\.sh[^\n]*(\\\n[^\n]*)*\btime-series\b/

  for (const mode of ['daily', 'rebuild', 'rescrape', 'rescrape-historical']) {
    it(`${mode}: syncs time-series and the region history before compute, publishes time-series after`, () => {
      // A position is [step index, offset in its run text]: a step may sync,
      // compute and publish in one script.
      type Pos = [number, number]
      const at = (re: RegExp, after: Pos): Pos | null => {
        for (let i = after[0]; i < steps.length; i++) {
          const s = steps[i]!
          if (!(s.name ?? '').startsWith(`[${mode}]`)) continue
          const run = s.run ?? ''
          const from = i === after[0] ? after[1] + 1 : 0
          const hit = run.slice(from).search(re)
          if (hit >= 0) return [i, from + hit]
        }
        return null
      }
      const sync = at(SYNC_INPUTS, [0, -1])
      expect(sync, `${mode} syncs time-series + region history`).not.toBeNull()
      const compute = at(COMPUTE, sync!)
      expect(compute, `${mode} computes after the sync`).not.toBeNull()
      expect(
        at(PUBLISH, compute!),
        `${mode} publishes time-series after compute`
      ).not.toBeNull()
    })
  }
})
