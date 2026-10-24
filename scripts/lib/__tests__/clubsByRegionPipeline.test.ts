/**
 * snapshots/<date>/clubs-by-region/ in the pipeline (#1800, epic #1781).
 *
 * compute-analytics writes one shard per region plus world.json into the
 * date's snapshot directory. The contracts pinned here:
 *   1. the content gate gives the shard and the world file their own kinds,
 *      always checked: schema (strict rows: no contact, link or meeting
 *      field), the path's date and key, that date's program year, and the
 *      internal counts;
 *   2. both are promoted with their date, never as global objects;
 *   3. every upload path (process-dates.sh, for daily since #1765, rebuild,
 *      rescrape and rescrape-historical) sends the subdirectory, through
 *      gcs-upload.sh so each object is in the run manifest (ADR-015 P5).
 *
 * The CDN schema canary is deliberately NOT extended: the objects are not on
 * prod yet (blocked on #1763 for promotion), and a canary would alert before
 * their first promotion (#2008).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type {
  ClubsByRegionShard,
  ClubsByRegionWorld,
  ClubsByRegionWorldPoints,
} from '@taverns-red/shared-contracts'
import { classifyPromotionPath } from '../manifestPromotion.js'
import {
  checkObject,
  classifyObject,
  planContentChecks,
  type CheckContext,
  type StoredObject,
} from '../promotionContentGate.js'

const REPO = process.cwd()
const DATE = '2026-10-16'
const SHARD = `snapshots/${DATE}/clubs-by-region/05.json`
const WORLD = `snapshots/${DATE}/clubs-by-region/world.json`
const POINTS = `snapshots/${DATE}/clubs-by-region/world-points.json`
const RECORDED = JSON.parse(
  readFileSync(
    path.join(
      REPO,
      'packages/shared-contracts/src/__tests__/__fixtures__/recorded-clubs-by-region.json'
    ),
    'utf-8'
  )
) as {
  world: ClubsByRegionWorld
  worldPoints: ClubsByRegionWorldPoints
  shards: Record<string, ClubsByRegionShard>
}

const CTX: CheckContext = {
  latestSnapshotDate: DATE,
  availableDates: [DATE],
  clubHistoryShards: { staging: [], prod: [] },
}

const plain = (value: unknown): StoredObject => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
})

const check = (p: string, value: unknown) =>
  checkObject({ path: p, kind: classifyObject(p)! }, plain(value), null, CTX)

const shard = () => structuredClone(RECORDED.shards['05']!)
const world = () => structuredClone(RECORDED.world)
const points = () => structuredClone(RECORDED.worldPoints)

describe('content gate: clubs-by-region (#1800)', () => {
  it('gives the shard and the world file their own kinds', () => {
    expect(classifyObject(SHARD)).toBe('clubs-by-region-shard')
    expect(
      classifyObject(`snapshots/${DATE}/clubs-by-region/unassigned.json`)
    ).toBe('clubs-by-region-shard')
    expect(classifyObject(WORLD)).toBe('clubs-by-region-world')
    expect(classifyObject(POINTS)).toBe('clubs-by-region-world-points')
    expect(classifyObject('config/clubs-by-region/05.json')).toBe('json')
  })

  it('is always checked, never sampled out', () => {
    const meta = (name: string) => ({ name, size: 1 })
    const plan = planContentChecks(
      [
        ...Array.from({ length: 20 }, (_, i) =>
          meta(`snapshots/${DATE}/district_${i + 100}.json`)
        ),
        meta(SHARD),
        meta(WORLD),
        meta(POINTS),
      ],
      { random: () => 0, caps: { generic: 0 } }
    )
    expect(plan.checks.map(c => c.path).sort()).toEqual(
      [SHARD, WORLD, POINTS].sort()
    )
  })

  it('passes every recorded shard and the recorded world file', () => {
    for (const [key, s] of Object.entries(RECORDED.shards)) {
      expect(
        check(`snapshots/${DATE}/clubs-by-region/${key}.json`, s),
        key
      ).toBeNull()
    }
    expect(check(WORLD, RECORDED.world)).toBeNull()
    expect(check(POINTS, RECORDED.worldPoints)).toBeNull()
  })

  it('fails a shard row that carries a contact field', () => {
    const bad = shard()
    Object.assign(bad.clubs[0]!, { email: 'president@example.org' })
    expect(check(SHARD, bad)).toMatch(/email|schema/)
  })

  it('fails a club name that still carries a meeting link', () => {
    const bad = shard()
    bad.clubs[0]!.name = 'Speakers https://zoom.us/j/123456789'
    expect(check(SHARD, bad)).toMatch(/link/)
  })

  // #2157: a D02 club's passcode reached the shards through its city.
  it('fails a city that still carries a meeting credential', () => {
    const bad = shard()
    bad.clubs[0]!.city = 'Springfield Passcode: 000000'
    expect(check(SHARD, bad)).toMatch(/credential/)
  })

  it('passes a real city that starts with "Pin"', () => {
    const ok = shard()
    ok.clubs[0]!.city = 'Pine Bluff'
    expect(check(SHARD, ok)).toBeNull()
  })

  it('fails a shard served under another date or another region key', () => {
    expect(
      check(`snapshots/2026-10-15/clubs-by-region/05.json`, shard())
    ).toMatch(/2026-10-15/)
    expect(check(`snapshots/${DATE}/clubs-by-region/09.json`, shard())).toMatch(
      /09/
    )
  })

  it('fails a program year that is not the logical date’s', () => {
    expect(check(SHARD, { ...shard(), programYear: '2025-2026' })).toMatch(
      /2026-2027/
    )
  })

  it('fails a shard whose counts do not match its rows', () => {
    const bad = shard()
    bad.counts.unmapped += 1
    expect(check(SHARD, bad)).toMatch(/unmapped|counts/)
  })

  it('fails a shard holding a club from a district it does not list', () => {
    const bad = shard()
    bad.clubs[0]!.d = '17'
    expect(check(SHARD, bad)).toMatch(/17/)
  })

  it('fails a points file whose count does not match its points', () => {
    const bad = points()
    bad.points.pop()
    expect(check(POINTS, bad)).toMatch(/count|points/)
  })

  it('fails a points file served under another date', () => {
    expect(
      check(`snapshots/2026-10-15/clubs-by-region/world-points.json`, points())
    ).toMatch(/2026-10-15/)
  })

  it('fails a points file listing a club twice', () => {
    const bad = points()
    bad.points.push(bad.points[0]!)
    bad.count += 1
    expect(check(POINTS, bad)).toMatch(/twice/)
  })

  it('fails a world file that does not point at its points file', () => {
    const bad = world() as unknown as { pointsPath: string }
    bad.pointsPath = 'clubs-by-region/points.json'
    expect(check(WORLD, bad)).toMatch(/pointsPath|schema/)
  })

  it('fails a world file whose shards do not sum to its totals', () => {
    const bad = world()
    bad.shards!['05']!.clubs += 1
    expect(check(WORLD, bad)).toMatch(/shards|clubs/)
  })

  it('fails a world file listing a shard at a path that is not its key', () => {
    const bad = world()
    bad.shards!['05']!.path = 'clubs-by-region/09.json'
    expect(check(WORLD, bad)).toMatch(/path/)
  })
})

describe('promotion: clubs-by-region moves with its date (#1800)', () => {
  it('is a date object for scoped promotion', () => {
    for (const p of [SHARD, WORLD, POINTS]) {
      expect(classifyPromotionPath(p)).toEqual({ kind: 'date', date: DATE })
    }
  })
})

describe('data-pipeline.yml: the daily upload sends clubs-by-region/ (#1800)', () => {
  const workflow = parseYaml(
    readFileSync(
      path.join(REPO, '.github/workflows/data-pipeline.yml'),
      'utf-8'
    )
  ) as {
    jobs: Record<string, { steps?: Array<{ name?: string; run?: string }> }>
  }
  const steps = workflow.jobs['pipeline']!.steps ?? []

  // Daily uploads through process-dates.sh since #1765, which sends the
  // subdirectory through gcs-upload.sh, -Z with the CDN headers, in every
  // mode: processDates.test.ts ("publishes the per-region club shards" for
  // rebuild, "process-dates.sh daily (#1765)" for daily).
  it('daily hands its upload to process-dates.sh, which sends the subdirectory', () => {
    const daily = steps.filter(s => (s.name ?? '').startsWith('[daily]'))
    expect(
      daily.some(s =>
        (s.run ?? '').includes(
          'scripts/pipeline/process-dates.sh "${GCS_BUCKET}" daily'
        )
      )
    ).toBe(true)
    expect(daily.some(s => (s.run ?? '').includes('clubs-by-region'))).toBe(
      false
    )
    const runner = readFileSync(
      path.join(REPO, 'scripts/pipeline/process-dates.sh'),
      'utf-8'
    )
    expect(runner).toContain(
      '"gs://${BUCKET}/snapshots/${actual}/clubs-by-region/"'
    )
  })
})
