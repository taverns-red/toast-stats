import { describe, it, expect } from 'vitest'
import type {
  DistrictReportsDataset,
  SuspendedClubs,
} from '@taverns-red/shared-contracts'
import recorded from '../../__tests__/fixtures/d61-growth-reports.recorded.json'
import suspendedJson from '../../__tests__/fixtures/suspended-clubs-2026-10-13.recorded.json'
import {
  buildClubGrowthFunnel,
  daysBetween,
  parseProspectStage,
  readGrowthCounts,
  type GrowthCounts,
} from '../clubGrowthFunnel'

/* #1794 — the district Club Growth funnel. Every input shape below is
   RECORDED (see the fixture's _provenance): the live D61 reports sidecar for
   2026-10-11, and the real DistrictReportsBuilder run over the recorded
   2026-06-01 new-clubs capture. Nothing here is a hand-written shape. */

const live = recorded.cdn_2026_10_11 as unknown as DistrictReportsDataset
const suspendedRecorded = suspendedJson as unknown as SuspendedClubs
const PY_2026 = { startDate: '2026-07-01', endDate: '2027-06-30' }
const PY_2025 = { startDate: '2025-07-01', endDate: '2026-06-30' }
const KNOWN_ZERO: GrowthCounts = { chartered: 0, suspended: 0 }

function withNewClubs(): DistrictReportsDataset {
  return {
    ...live,
    programYear: '2025-2026',
    sections: {
      ...live.sections,
      newClubs: recorded.collector_2026_06_01_newClubs,
    },
  }
}

describe('parseProspectStage (recorded D61 vocabulary)', () => {
  it('parses every live prospect string', () => {
    const parsed = live.sections.prospectiveClubs!.records.map(r =>
      parseProspectStage(r.prospect)
    )
    expect(parsed.every(p => p.recognised)).toBe(true)
  })

  it('splits the stage from the run-on payment text', () => {
    // Live text has no separator: "...04/15/2025Payment Complete - 04/19/2025"
    expect(
      parseProspectStage(
        '#1 Application to Organize Complete - 04/15/2025Payment Complete - 04/19/2025'
      )
    ).toEqual({
      recognised: true,
      stageNumber: 1,
      stageLabel: 'Application to Organize',
      stageDate: '2025-04-15',
      payment: 'complete',
      paymentDate: '2025-04-19',
      raw: '#1 Application to Organize Complete - 04/15/2025Payment Complete - 04/19/2025',
    })
  })

  it('reads an incomplete payment', () => {
    const p = parseProspectStage(
      '#1 Application to Organize Complete - 03/21/2026Payment Incomplete'
    )
    expect(p).toMatchObject({
      recognised: true,
      stageDate: '2026-03-21',
      payment: 'incomplete',
      paymentDate: null,
    })
  })

  it('keeps unrecognised text raw instead of guessing', () => {
    expect(parseProspectStage('Something new from TI')).toEqual({
      recognised: false,
      raw: 'Something new from TI',
    })
    expect(parseProspectStage('')).toEqual({ recognised: false, raw: '' })
  })
})

describe('daysBetween', () => {
  it('counts whole calendar days, timezone-free', () => {
    expect(daysBetween('2026-10-01', '2026-10-11')).toBe(10)
    expect(daysBetween('2025-04-15', '2026-10-11')).toBe(544)
  })
})

describe('buildClubGrowthFunnel — prospective', () => {
  const funnel = buildClubGrowthFunnel({
    districtId: '61',
    reports: live,
    counts: KNOWN_ZERO,
    programYear: PY_2026,
    asOfDate: '2026-10-11',
  })

  it('counts the 8 live prospective clubs', () => {
    expect(funnel.prospective.value).toEqual({ kind: 'count', value: 8 })
    expect(funnel.prospective.clubs).toHaveLength(8)
  })

  it('groups them by stage', () => {
    expect(funnel.prospective.byStage).toEqual([
      { stageNumber: 1, stageLabel: 'Application to Organize', count: 8 },
    ])
  })

  it('orders longest-waiting first, with days in stage', () => {
    const first = funnel.prospective.clubs[0]!
    expect(first.clubId).toBe('28678700')
    expect(first.daysInStage).toBe(daysBetween('2025-04-15', '2026-10-11'))
    expect(first.payment).toBe('complete')
    const days = funnel.prospective.clubs.map(c => c.daysInStage ?? -1)
    expect([...days].sort((a, b) => b - a)).toEqual(days)
  })

  it('links prospective clubs to TI, never to an internal club page', () => {
    expect(funnel.prospective.clubs[0]!.href).toBe(
      'https://www.toastmasters.org/Find-a-Club/28678700'
    )
  })

  it('is unknown — not 0 — when the date has no prospective report', () => {
    const f = buildClubGrowthFunnel({
      districtId: '61',
      reports: null,
      counts: KNOWN_ZERO,
      programYear: PY_2026,
      asOfDate: '2026-10-11',
    })
    expect(f.prospective.value.kind).toBe('unknown')
    expect(f.coached.value.kind).toBe('unknown')
  })
})

describe('buildClubGrowthFunnel — chartered this program year', () => {
  it('takes the count from the rankings row and the clubs from newClubs', () => {
    const f = buildClubGrowthFunnel({
      districtId: '61',
      reports: withNewClubs(),
      counts: { chartered: 5, suspended: 3 },
      programYear: PY_2025,
      asOfDate: '2026-06-01',
    })
    expect(f.chartered.value).toEqual({ kind: 'count', value: 5 })
    expect(f.chartered.clubs.map(c => c.clubId)).toEqual([
      '28680300',
      '28678571',
      '28679190',
      '28679222',
      '28679503',
    ])
    expect(f.chartered.clubs[0]).toMatchObject({
      clubName: 'iA Montreal Toastmasters',
      charterDate: '2026-05-22',
      href: '/district/61/club/28680300',
    })
  })

  it('drops new-club rows chartered outside the program year', () => {
    const f = buildClubGrowthFunnel({
      districtId: '61',
      reports: withNewClubs(),
      counts: KNOWN_ZERO,
      programYear: PY_2026,
      asOfDate: '2026-10-11',
    })
    expect(f.chartered.clubs).toEqual([])
    expect(f.chartered.value).toEqual({ kind: 'count', value: 0 })
  })

  it('is unknown when the rankings count was not collected', () => {
    const f = buildClubGrowthFunnel({
      districtId: '61',
      reports: live,
      counts: { chartered: null, suspended: null },
      programYear: PY_2026,
      asOfDate: '2026-10-11',
    })
    // newClubs is present (0 rows) but it is a report, not the count — the
    // stage falls back to the report's rows only when they exist.
    expect(f.chartered.value.kind).toBe('unknown')
  })
})

describe('buildClubGrowthFunnel — coached', () => {
  const funnel = buildClubGrowthFunnel({
    districtId: '61',
    reports: live,
    counts: KNOWN_ZERO,
    programYear: PY_2026,
    asOfDate: '2026-10-11',
  })

  it('counts distinct clubs with an active (PENDING) coach', () => {
    // Live: 8 PENDING rows over 6 clubs (1269833 appears twice, identically;
    // 5046 has two engagements).
    expect(funnel.coached.value).toEqual({ kind: 'count', value: 6 })
    expect(funnel.coached.active.map(c => c.clubId)).toEqual([
      '1269833',
      '675689',
      '1296822',
      '5046',
      '684093',
      '7027',
    ])
  })

  it('keeps the most recent active engagement per club, newest first', () => {
    const ids = funnel.coached.active.map(c => c.clubId)
    expect(new Set(ids).size).toBe(ids.length)
    const avance = funnel.coached.active.find(c => c.clubId === '5046')!
    expect(avance.since).toBe('2026-07-25')
    const since = funnel.coached.active.map(c => c.since)
    expect([...since].sort().reverse()).toEqual(since)
    expect(funnel.coached.active[0]!.href).toBe('/district/61/club/1269833')
  })

  it('lists completed coach assignments separately', () => {
    expect(funnel.coached.completed.map(c => c.clubId).sort()).toEqual(
      ['4673', '4675249', '6502', '6552', '901116', '9361'].sort()
    )
  })

  it('carries no person names (counts and status only)', () => {
    const json = JSON.stringify(funnel)
    expect(json).not.toMatch(/@/)
    for (const row of [...funnel.coached.active, ...funnel.coached.completed]) {
      expect(Object.keys(row).sort()).toEqual(
        ['clubId', 'clubName', 'href', 'since', 'status'].sort()
      )
    }
  })
})

describe('buildClubGrowthFunnel — suspended (#1757)', () => {
  it('shows a measured count', () => {
    const f = buildClubGrowthFunnel({
      districtId: '61',
      reports: live,
      counts: { chartered: 0, suspended: 2 },
      programYear: PY_2026,
      asOfDate: '2026-10-11',
    })
    expect(f.suspended.value).toEqual({ kind: 'count', value: 2 })
  })

  it('renders unknown, never 0, when the count is not known', () => {
    const f = buildClubGrowthFunnel({
      districtId: '61',
      reports: live,
      counts: { chartered: 0, suspended: null },
      programYear: PY_2026,
      asOfDate: '2026-10-11',
    })
    expect(f.suspended.value.kind).toBe('unknown')
  })
})

describe('buildClubGrowthFunnel — suspended club list (#1953)', () => {
  // Recorded 2026-10-13 file: D83 lists 3 clubs, D61 is a measured [].
  const d83 = suspendedRecorded.districts['83']!
  const base = {
    districtId: '83',
    reports: live,
    programYear: PY_2026,
    asOfDate: '2026-10-13',
  }

  it('lists each suspended club with its date and division / area', () => {
    const f = buildClubGrowthFunnel({
      ...base,
      counts: { chartered: 8, suspended: 3 },
      suspendedClubs: d83,
      clubPageIds: new Set(['1380016', '875053', '28678052']),
    })
    expect(f.suspended.value).toEqual({ kind: 'count', value: 3 })
    expect(f.suspended.clubs).toEqual([
      {
        clubId: '1380016',
        clubName: 'Travelers Toastmasters',
        division: 'C',
        area: '33',
        suspendDate: '2026-10-01',
        href: '/district/83/club/1380016',
        external: false,
      },
      expect.objectContaining({ clubId: '875053', area: '71' }),
      expect.objectContaining({ clubId: '28678052', area: '74' }),
    ])
  })

  it('links a club with no page here to its toastmasters.org page', () => {
    const f = buildClubGrowthFunnel({
      ...base,
      counts: { chartered: 8, suspended: 3 },
      suspendedClubs: d83,
      clubPageIds: new Set(['1380016']),
    })
    const cartus = f.suspended.clubs?.find(c => c.clubId === '875053')
    expect(cartus).toMatchObject({
      href: 'https://www.toastmasters.org/Find-a-Club/00875053',
      external: true,
    })
  })

  it('keeps a measured zero as an empty list', () => {
    const f = buildClubGrowthFunnel({
      ...base,
      districtId: '61',
      counts: KNOWN_ZERO,
      suspendedClubs: suspendedRecorded.districts['61']!,
    })
    expect(f.suspended.clubs).toEqual([])
    expect(f.suspended.value).toEqual({ kind: 'count', value: 0 })
  })

  it('is not measured (null), not empty, when the date has no list', () => {
    const f = buildClubGrowthFunnel({
      ...base,
      counts: { chartered: 8, suspended: 3 },
      suspendedClubs: null,
    })
    expect(f.suspended.clubs).toBeNull()
    expect(f.suspended.value).toEqual({ kind: 'count', value: 3 })
  })

  it('takes the count from a measured list when the rankings count is unknown', () => {
    const f = buildClubGrowthFunnel({
      ...base,
      counts: { chartered: null, suspended: null },
      suspendedClubs: d83,
    })
    expect(f.suspended.value).toEqual({ kind: 'count', value: 3 })
  })
})

describe('readGrowthCounts', () => {
  const row = (
    districtId: string,
    extra: { newCharteredClubs?: number; suspendedClubs?: number }
  ) => ({ districtId, ...extra })

  const census = (n: number, extra: (i: number) => object) =>
    Array.from({ length: n }, (_, i) => ({
      districtId: String(i + 1),
      ...extra(i),
    }))

  it('reads both counts for the district', () => {
    const rankings = [
      ...census(60, i => ({ newCharteredClubs: i % 3, suspendedClubs: i % 2 })),
      row('61', { newCharteredClubs: 4, suspendedClubs: 1 }),
    ]
    expect(readGrowthCounts(rankings, '61')).toEqual({
      chartered: 4,
      suspended: 1,
    })
  })

  it('a measured 0 stays 0 when other districts report suspensions', () => {
    const rankings = [
      ...census(60, i => ({ newCharteredClubs: 1, suspendedClubs: i % 2 })),
      row('61', { newCharteredClubs: 0, suspendedClubs: 0 }),
    ]
    expect(readGrowthCounts(rankings, '61')).toEqual({
      chartered: 0,
      suspended: 0,
    })
  })

  it('a census-wide zero means not collected (#1757), so unknown', () => {
    const rankings = [
      ...census(60, () => ({ newCharteredClubs: 2, suspendedClubs: 0 })),
      row('61', { newCharteredClubs: 1, suspendedClubs: 0 }),
    ]
    expect(readGrowthCounts(rankings, '61')).toEqual({
      chartered: 1,
      suspended: null,
    })
  })

  it('an absent field or absent district is unknown', () => {
    const rankings = census(60, () => ({ newCharteredClubs: 1 }))
    expect(readGrowthCounts(rankings, '1')).toEqual({
      chartered: 1,
      suspended: null,
    })
    expect(readGrowthCounts(rankings, '999')).toEqual({
      chartered: null,
      suspended: null,
    })
  })
})
