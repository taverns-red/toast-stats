/**
 * snapshots/<date>/region-rollups.json in the pipeline (#1799, epic #1781).
 *
 * The artifact is written by compute-analytics into the date's snapshot
 * directory, so the per-date upload records it in the run manifest and
 * promotion copies it with its date (a `date` object for scoped promotion).
 * The contracts pinned here:
 *   1. the content gate gives it its own kind, always checked, never
 *      sampled out: schema, the path's date, that date's program year, and
 *      world = Σ districts;
 *   2. it is promoted with its date, never as a global object;
 *   3. every mode that runs compute-analytics pulls
 *      config/district-region-history.json first (sync-stores.sh
 *      district-region-history), so regions come from each PY's own
 *      membership, not from nothing.
 *
 * The CDN schema canary is deliberately NOT extended: the object is not on
 * prod yet, and a canary would alert before its first promotion (#2008).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import { classifyPromotionPath } from '../manifestPromotion.js'
import {
  checkObject,
  classifyObject,
  planContentChecks,
  PROMOTED_PREFIXES,
  type CheckContext,
  type StoredObject,
} from '../promotionContentGate.js'

const REPO = process.cwd()
const PATH = 'snapshots/2026-06-30/region-rollups.json'
const RECORDED = JSON.parse(
  readFileSync(
    path.join(
      REPO,
      'packages/shared-contracts/src/__tests__/__fixtures__/recorded-region-rollups.json'
    ),
    'utf-8'
  )
) as RegionRollups

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

describe('content gate: region-rollups (#1799)', () => {
  it('is its own kind', () => {
    expect(classifyObject(PATH)).toBe('region-rollups')
    expect(classifyObject('snapshots/2026-06-30/region-rollups.jsonx')).toBe(
      null
    )
    expect(classifyObject('config/region-rollups.json')).toBe('json')
  })

  it('is always checked, never sampled out', () => {
    const meta = (name: string) => ({ name, size: 1 })
    const plan = planContentChecks(
      [
        ...Array.from({ length: 20 }, (_, i) =>
          meta(`snapshots/2026-06-30/district_${i + 100}.json`)
        ),
        meta(PATH),
        meta('snapshots/2026-10-12/region-rollups.json'),
      ],
      { random: () => 0, caps: { generic: 0 } }
    )
    expect(plan.checks.map(c => c.path).sort()).toEqual([
      PATH,
      'snapshots/2026-10-12/region-rollups.json',
    ])
  })

  it('passes the recorded artifact', () => {
    expect(check(PATH, RECORDED)).toBeNull()
  })

  it('fails an artifact that breaks the shared-contracts schema', () => {
    expect(check(PATH, { ...RECORDED, world: { clubs: 1 } })).toMatch(/schema/)
  })

  it('fails an artifact served under another date', () => {
    expect(check('snapshots/2026-07-25/region-rollups.json', RECORDED)).toMatch(
      /2026-06-30.*2026-07-25|2026-07-25.*2026-06-30/
    )
  })

  it('fails a program year that is not the logical date’s (the July-collection slip)', () => {
    expect(check(PATH, { ...RECORDED, programYear: '2026-2027' })).toMatch(
      /2025-2026/
    )
  })

  it('fails a world block that is not the sum of its districts', () => {
    const bad = structuredClone(RECORDED)
    bad.world.clubs += 1
    expect(check(PATH, bad)).toMatch(/world/)
  })

  it('fails a region that lists a district not in it', () => {
    const bad = structuredClone(RECORDED)
    bad.regions!['07']!.districtIds = ['68']
    expect(check(PATH, bad)).toMatch(/region 07/)
  })

  describe('officer training (#2296)', () => {
    /** RECORDED with a consistent officer-training distribution on every
     *  block: each district gets its own vector, regions and world the sums. */
    const withOfficerTraining = (): RegionRollups => {
      const r = structuredClone(RECORDED)
      const vector = (seed: number) =>
        Array.from({ length: 8 }, (_, i) => (seed * (i + 1)) % 5)
      const sum = (rows: { round1: number[]; round2: number[] }[]) => ({
        round1: Array.from({ length: 8 }, (_, i) =>
          rows.reduce((a, row) => a + row.round1[i]!, 0)
        ),
        round2: Array.from({ length: 8 }, (_, i) =>
          rows.reduce((a, row) => a + row.round2[i]!, 0)
        ),
      })
      Object.values(r.districts).forEach((d, n) => {
        d.officerTraining = { round1: vector(n + 1), round2: vector(n + 2) }
      })
      for (const block of Object.values(r.regions ?? {})) {
        block.officerTraining = sum(
          block.districtIds.map(id => r.districts[id]!.officerTraining!)
        )
      }
      r.world.officerTraining = sum(
        Object.values(r.districts).map(d => d.officerTraining!)
      )
      return r
    }

    it('passes blocks whose distributions are the sums of their districts', () => {
      expect(check(PATH, withOfficerTraining())).toBeNull()
    })

    it('fails a world distribution that is not the sum of its districts', () => {
      const bad = withOfficerTraining()
      bad.world.officerTraining!.round1[7]! += 1
      expect(check(PATH, bad)).toMatch(/world: officerTraining\.round1\.7/)
    })

    it('fails a region distribution that is not the sum of its districts', () => {
      const bad = withOfficerTraining()
      const region = Object.keys(bad.regions!)[0]!
      bad.regions![region]!.officerTraining!.round2[0]! += 1
      expect(check(PATH, bad)).toMatch(
        new RegExp(`region ${region}: officerTraining\\.round2\\.0`)
      )
    })
  })
})

describe('promotion: region-rollups moves with its date (#1799)', () => {
  it('is under a promoted prefix, a date object for scoped promotion', () => {
    expect(PROMOTED_PREFIXES.some(p => PATH.startsWith(p))).toBe(true)
    expect(classifyPromotionPath(PATH)).toEqual({
      kind: 'date',
      date: '2026-06-30',
    })
  })
})

describe('data-pipeline.yml: the region history is pulled before compute (#1799)', () => {
  const workflow = parseYaml(
    readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as {
    jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
  }
  const steps = workflow.jobs['pipeline']!.steps ?? []
  const index = (re: RegExp) => steps.findIndex(s => re.test(s.run ?? ''))

  for (const mode of ['daily', 'rebuild', 'rescrape', 'rescrape-historical']) {
    it(`${mode}: sync-stores.sh pulls district-region-history before compute-analytics`, () => {
      const modeSteps = steps.filter(s =>
        (s.name ?? '').startsWith(`[${mode}]`)
      )
      const pull = modeSteps.find(s =>
        /sync-stores\.sh[^\n]*(\\\n[^\n]*)*district-region-history/.test(
          s.run ?? ''
        )
      )
      expect(pull, `${mode} pulls the region history`).toBeDefined()
      const pullAt = steps.indexOf(pull!)
      const computeAt = steps.findIndex(
        (s, i) =>
          i >= pullAt &&
          (s.name ?? '').startsWith(`[${mode}]`) &&
          /compute-analytics|process-dates\.sh|COLLECTOR/.test(s.run ?? '')
      )
      expect(computeAt).toBeGreaterThanOrEqual(pullAt)
    })
  }

  it('never pushes it back: it is an input, owned by build-identity-history.sh', () => {
    expect(index(/publish-stores\.sh[^\n]*district-region-history/)).toBe(-1)
  })
})
