/**
 * Clubs-table coach status (#1954, split from #1794). The coach report
 * (`districtReports.sections.coaches`) is joined onto every ClubTrend at the
 * same single site as the dues-renewal overlay, reusing the Club Growth
 * funnel's dedupe + latest-engagement rule, then surfaced as a Coach column,
 * a categorical filter and a CSV column. Status only — never a coach identity.
 *
 * Fixture: the RECORDED D61 2026-10-11 reports sidecar (see _provenance).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/d61-growth-reports.recorded.json'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import {
  applyCoachOverlay,
  buildCoachLookup,
  coachFilterValue,
} from '../clubCoach'
import { applyFilter, processClubs } from '../columnFilterUtils'
import { exportClubPerformance } from '../csvExport'

const live = recorded.cdn_2026_10_11 as unknown as DistrictReportsDataset

const club = (clubId: string, clubName = `Club ${clubId}`): ClubTrend => ({
  clubId,
  clubName,
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-10-11', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-10-11', goalsAchieved: 3 }],
})

describe('buildCoachLookup / applyCoachOverlay', () => {
  it('attaches the latest engagement per club from the live report', () => {
    const clubs = [club('5046'), club('4673'), club('3045')]
    applyCoachOverlay(clubs, buildCoachLookup(live))
    expect(clubs[0]!.coach).toEqual({ status: 'active', since: '2026-07-25' })
    expect(clubs[1]!.coach).toEqual({
      status: 'completed',
      since: '2025-12-09',
    })
    // A club with no coach row gets no field at all.
    expect(clubs[2]).not.toHaveProperty('coach')
  })

  it('matches ids across zero-padding (normalizeClubId)', () => {
    const clubs = [club('00005046')]
    applyCoachOverlay(clubs, buildCoachLookup(live))
    expect(clubs[0]!.coach?.status).toBe('active')
  })

  it('is a no-op without a coaches section', () => {
    const clubs = [club('5046')]
    applyCoachOverlay(clubs, buildCoachLookup(null))
    expect(clubs[0]).not.toHaveProperty('coach')
  })

  it('carries status and date only — no coach identity', () => {
    const clubs = [club('1269833')]
    applyCoachOverlay(clubs, buildCoachLookup(live))
    expect(Object.keys(clubs[0]!.coach!).sort()).toEqual(['since', 'status'])
  })
})

describe('coach filter', () => {
  const clubs = [club('5046'), club('4673'), club('3045')]
  applyCoachOverlay(clubs, buildCoachLookup(live))

  it('labels each club Active / Completed / None', () => {
    expect(clubs.map(coachFilterValue)).toEqual(['Active', 'Completed', 'None'])
  })

  it('filters on the label through the shared pipeline', () => {
    const processed = processClubs(clubs)
    const only = (values: string[]) =>
      applyFilter(processed, {
        field: 'coach',
        type: 'categorical',
        value: values,
        operator: 'in',
      }).map(c => c.clubId)
    expect(only(['Active'])).toEqual(['5046'])
    expect(only(['Completed', 'None'])).toEqual(['4673', '3045'])
    expect(only([])).toEqual(['5046', '4673', '3045'])
  })
})

describe('CSV export Coach column', () => {
  let captured: string | null = null
  const OriginalBlob = globalThis.Blob

  beforeEach(() => {
    captured = null
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
    globalThis.Blob = class {
      constructor(parts?: ConstructorParameters<typeof Blob>[0]) {
        captured = (parts?.[0] as string | undefined) ?? null
        return new OriginalBlob(parts)
      }
    } as unknown as typeof Blob
  })
  afterEach(() => {
    globalThis.Blob = OriginalBlob
    vi.restoreAllMocks()
  })

  it('exports Active / Completed / blank under a Coach header', () => {
    const clubs = [club('5046'), club('4673'), club('3045')]
    applyCoachOverlay(clubs, buildCoachLookup(live))
    exportClubPerformance(clubs, '61')
    const lines = captured!.split('\n')
    const header = lines.find(l => l.startsWith('Club ID'))!.split(',')
    const col = header.indexOf('Coach')
    expect(col).toBeGreaterThan(-1)
    const cell = (id: string) =>
      lines.find(l => l.startsWith(`${id},`))!.split(',')[col]
    expect(cell('5046')).toBe('Active')
    expect(cell('4673')).toBe('Completed')
    expect(cell('3045')).toBe('')
  })
})
