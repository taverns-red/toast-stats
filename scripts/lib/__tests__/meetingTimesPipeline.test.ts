/**
 * snapshots/<date>/meeting-times.json in the pipeline (#1814, epic #1781).
 *
 * compute-analytics writes it into the date's snapshot directory, beside
 * region-rollups.json, so the per-date upload records it in the run
 * manifest and promotion copies it with its date. Pinned here:
 *   1. the content gate gives it its own kind, always checked, never
 *      sampled out: schema, the path's date, that date's program year,
 *      totals = Σ districts, and each grid within its district's counts;
 *   2. it is promoted with its date, never as a global object.
 *
 * The recorded artifact is the builder's output over recorded prod district
 * files (analytics-core fixtures/meeting-times).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import type { MeetingTimes } from '@taverns-red/shared-contracts'
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
const PATH = 'snapshots/2026-10-19/meeting-times.json'
const RECORDED = JSON.parse(
  readFileSync(
    path.join(
      REPO,
      'packages/shared-contracts/src/__tests__/__fixtures__/recorded-meeting-times.json'
    ),
    'utf-8'
  )
) as MeetingTimes

const CTX: CheckContext = {
  latestSnapshotDate: '2026-10-19',
  availableDates: ['2026-10-19'],
  clubHistoryShards: { staging: [], prod: [] },
}

const plain = (value: unknown): StoredObject => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
})

const check = (p: string, value: unknown) =>
  checkObject({ path: p, kind: classifyObject(p)! }, plain(value), null, CTX)

describe('content gate: meeting-times (#1814)', () => {
  it('is its own kind', () => {
    expect(classifyObject(PATH)).toBe('meeting-times')
    expect(classifyObject('config/meeting-times.json')).toBe('json')
  })

  it('is always checked, never sampled out', () => {
    const meta = (name: string) => ({ name, size: 1 })
    const plan = planContentChecks(
      [
        ...Array.from({ length: 20 }, (_, i) =>
          meta(`snapshots/2026-10-19/district_${i + 100}.json`)
        ),
        meta(PATH),
      ],
      { random: () => 0, caps: { generic: 0 } }
    )
    expect(plan.checks.map(c => c.path)).toEqual([PATH])
  })

  it('passes the recorded artifact', () => {
    expect(check(PATH, RECORDED)).toBeNull()
  })

  it('fails an artifact that breaks the shared-contracts schema', () => {
    const bad = structuredClone(RECORDED)
    bad.districts['61']!.modes.all.counts.pop()
    expect(check(PATH, bad)).toMatch(/schema/)
  })

  it('fails an artifact served under another date', () => {
    expect(check('snapshots/2026-10-18/meeting-times.json', RECORDED)).toMatch(
      /2026-10-19.*2026-10-18|2026-10-18.*2026-10-19/
    )
  })

  it('fails a program year that is not the logical date’s', () => {
    expect(check(PATH, { ...RECORDED, programYear: '2025-2026' })).toMatch(
      /2026-2027/
    )
  })

  it('fails totals that are not the sum of the districts', () => {
    const bad = structuredClone(RECORDED)
    bad.totals.scheduled += 1
    expect(check(PATH, bad)).toMatch(/totals/)
  })

  it('fails a district that schedules more clubs than it has', () => {
    const bad = structuredClone(RECORDED)
    bad.districts['61']!.scheduled = bad.districts['61']!.clubs + 1
    bad.totals.scheduled += bad.districts['61']!.scheduled - 158
    expect(check(PATH, bad)).toMatch(/district 61/)
  })

  it('fails a cell with more clubs than the district has scheduled', () => {
    const bad = structuredClone(RECORDED)
    bad.districts['49']!.modes.online.counts[2]![19] = 999
    expect(check(PATH, bad)).toMatch(/district 49.*online/)
  })

  it('fails a mode cell above the all-meetings cell (hybrid counts in both, never more)', () => {
    const bad = structuredClone(RECORDED)
    const all = bad.districts['61']!.modes.all.counts
    const online = bad.districts['61']!.modes.online.counts
    online[0]![3] = all[0]![3]! + 1
    expect(check(PATH, bad)).toMatch(/district 61.*online/)
  })
})

describe('promotion: meeting-times moves with its date (#1814)', () => {
  it('is under a promoted prefix, a date object for scoped promotion', () => {
    expect(PROMOTED_PREFIXES.some(p => PATH.startsWith(p))).toBe(true)
    expect(classifyPromotionPath(PATH)).toEqual({
      kind: 'date',
      date: '2026-10-19',
    })
  })
})
