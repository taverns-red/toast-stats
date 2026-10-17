/**
 * rollupGrowthFunnel (#1812 region, #1813 world) — the view model of the
 * region and world Club Growth funnels: Prospective → Chartered → Coached →
 * Suspended, each stage broken down by the level below (districts of a
 * region, regions of the world).
 *
 * Fixtures: `reports-rollups` is the #2117 builder's output over the recorded
 * prod 2026-10-15 sidecars of Regions 05 and 09; `region-rollups` is the
 * recorded prod 2026-10-15 file (#1799), whole.
 */
import { describe, it, expect } from 'vitest'
import {
  RegionRollupsSchema,
  ReportsRollupsSchema,
  type ReportsRollups,
} from '@taverns-red/shared-contracts'
import { buildRollupGrowthFunnel } from '../rollupGrowthFunnel'
import reportsRecorded from '../../__tests__/fixtures/reports-rollups-2026-10-15.recorded.json'
import rollupsRecorded from '../../__tests__/fixtures/region-rollups-2026-10-15.recorded.json'

const reports = ReportsRollupsSchema.parse(reportsRecorded)
const rollups = RegionRollupsSchema.parse(rollupsRecorded)

/** Region 05 with District 86's sidecar missing, as the builder writes it. */
function withoutDistrict86(): ReportsRollups {
  const copy = structuredClone(reports)
  copy.districts['86'] = {
    ...copy.districts['86']!,
    reports: 'no-file',
    prospective: null,
    coached: null,
    octoberDues: null,
    aprilDues: null,
    officerList: null,
    sponsorsMentors: null,
  }
  const r05 = copy.regions!['05']!
  copy.regions!['05'] = {
    ...r05,
    prospective: null,
    coached: null,
    sponsorsMentors: null,
    districtsWithoutReports: ['86'],
  }
  return copy
}

describe('buildRollupGrowthFunnel — region', () => {
  const funnel = buildRollupGrowthFunnel({
    reports,
    rollups,
    scope: { kind: 'region', regionId: '05' },
  })

  it('reads the four stages from the two artifacts', () => {
    expect(funnel.stages.prospective).toEqual({ kind: 'count', value: 35 })
    expect(funnel.stages.chartered).toEqual({ kind: 'count', value: 3 })
    expect(funnel.stages.coached).toEqual({ kind: 'count', value: 35 })
    expect(funnel.stages.suspended).toEqual({ kind: 'count', value: 5 })
    expect(funnel.paymentComplete).toBe(24)
    expect(funnel.coachingCompleted).toBe(37)
    expect(funnel.sponsorsMentors).toEqual({
      clubs: 31,
      sponsors: 50,
      mentors: 52,
      other: 0,
      awarded: 49,
    })
    expect(funnel.prospectiveByStage?.[0]).toEqual({
      stage: 1,
      label: 'Application to Organize',
      clubs: 32,
    })
  })

  it('breaks every stage down by district, linking to its funnel', () => {
    expect(funnel.children.map(c => c.id)).toEqual([
      '31',
      '53',
      '60',
      '61',
      '86',
      '123',
      '216',
    ])
    const d61 = funnel.children.find(c => c.id === '61')!
    expect(d61).toMatchObject({
      label: 'District 61',
      to: '/district/61/growth',
      prospective: 6,
      chartered: 0,
      coached: 6,
      coachingCompleted: 6,
      suspended: 0,
      sponsors: 12,
      mentors: 13,
      reportsMissing: false,
    })
    const d31 = funnel.children.find(c => c.id === '31')!
    expect(d31.suspended).toBe(1)
  })

  it('states coverage from the reports artifact', () => {
    expect(funnel.coverage).toEqual({ districts: 7, withoutReports: [] })
  })

  it('keeps a missing district null — never 0 — and says why', () => {
    const f = buildRollupGrowthFunnel({
      reports: withoutDistrict86(),
      rollups,
      scope: { kind: 'region', regionId: '05' },
    })
    expect(f.stages.prospective.kind).toBe('unknown')
    expect(f.stages.coached.kind).toBe('unknown')
    if (f.stages.prospective.kind === 'unknown') {
      expect(f.stages.prospective.reason).toMatch(/District 86/)
    }
    // The other stages come from region-rollups and are unaffected.
    expect(f.stages.chartered).toEqual({ kind: 'count', value: 3 })
    const d86 = f.children.find(c => c.id === '86')!
    expect(d86.prospective).toBeNull()
    expect(d86.coached).toBeNull()
    expect(d86.sponsors).toBeNull()
    expect(d86.reportsMissing).toBe(true)
    // A measured district keeps its own numbers.
    expect(f.children.find(c => c.id === '61')!.prospective).toBe(6)
    expect(f.coverage).toEqual({ districts: 7, withoutReports: ['86'] })
  })

  it('a missing reports artifact (404) is "not available yet", not zeros', () => {
    const f = buildRollupGrowthFunnel({
      reports: null,
      rollups,
      scope: { kind: 'region', regionId: '05' },
    })
    expect(f.reportsAvailable).toBe(false)
    expect(f.stages.prospective).toEqual({
      kind: 'unknown',
      reason: 'Not available yet for this date',
    })
    expect(f.stages.coached.kind).toBe('unknown')
    expect(f.stages.chartered).toEqual({ kind: 'count', value: 3 })
    expect(f.prospectiveByStage).toBeNull()
    expect(f.sponsorsMentors).toBeNull()
    expect(f.coverage).toBeNull()
    // Districts still come from region-rollups.
    expect(f.children).toHaveLength(7)
    expect(f.children.every(c => c.prospective === null)).toBe(true)
  })

  it('a missing region-rollups artifact leaves chartered/suspended unknown', () => {
    const f = buildRollupGrowthFunnel({
      reports,
      rollups: null,
      scope: { kind: 'region', regionId: '05' },
    })
    expect(f.stages.chartered.kind).toBe('unknown')
    expect(f.stages.suspended.kind).toBe('unknown')
    expect(f.stages.prospective).toEqual({ kind: 'count', value: 35 })
    expect(f.children.find(c => c.id === '61')!.chartered).toBeNull()
  })

  it('a region in neither artifact has no rows and says so', () => {
    const f = buildRollupGrowthFunnel({
      reports,
      rollups,
      scope: { kind: 'region', regionId: '99' },
    })
    expect(f.found).toBe(false)
    expect(f.children).toEqual([])
  })

  it('carries the page query (py/date) into the drill-down links', () => {
    const f = buildRollupGrowthFunnel({
      reports,
      rollups,
      scope: { kind: 'region', regionId: '05' },
      search: '?py=2026-2027&date=2026-10-15',
    })
    expect(f.children[0]!.to).toBe(
      '/district/31/growth?py=2026-2027&date=2026-10-15'
    )
  })
})

describe('buildRollupGrowthFunnel — world', () => {
  const funnel = buildRollupGrowthFunnel({
    reports,
    rollups,
    scope: { kind: 'world' },
  })

  it('reads the world block of each artifact', () => {
    expect(funnel.found).toBe(true)
    expect(funnel.stages.prospective).toEqual({ kind: 'count', value: 51 })
    expect(funnel.stages.chartered).toEqual({ kind: 'count', value: 222 })
    expect(funnel.stages.coached).toEqual({ kind: 'count', value: 78 })
    expect(funnel.stages.suspended).toEqual({ kind: 'count', value: 46 })
    expect(funnel.coverage).toEqual({ districts: 12, withoutReports: [] })
  })

  it('breaks down by region, each linking to its region funnel', () => {
    expect(funnel.children.map(c => c.id)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
    ])
    const r05 = funnel.children.find(c => c.id === '05')!
    expect(r05).toMatchObject({
      label: 'Region 05',
      to: '/region/05/growth',
      prospective: 35,
      chartered: 3,
      coached: 35,
      suspended: 5,
      reportsMissing: false,
    })
    // A region the reports artifact does not carry is null, never 0.
    const r01 = funnel.children.find(c => c.id === '01')!
    expect(r01.prospective).toBeNull()
    expect(r01.coached).toBeNull()
    expect(r01.chartered).toBe(9)
  })

  it('without region membership, the world block still renders', () => {
    const f = buildRollupGrowthFunnel({
      reports: { ...reports, regions: null },
      rollups: { ...rollups, regions: null },
      scope: { kind: 'world' },
    })
    expect(f.found).toBe(true)
    expect(f.stages.prospective).toEqual({ kind: 'count', value: 51 })
    expect(f.children).toEqual([])
  })
})
