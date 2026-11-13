/**
 * #2712 (UX decision D9): every net change on screen says what it is measured
 * against, in plain words ("since the start of the program year", "since this time last year"), and
 * the headline "Overall Improvement" names a direction without a basis, so it
 * is gone.
 *
 * Component-level only (R22: no page mounts). Bases arrive as props (R3).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { YearOverYearComparison } from '../YearOverYearComparison'
import { ChangeGroup } from '../ChangeGroup'
import {
  regionClubMetric,
  regionClubMetricText,
  sortRegionClubs,
  type RegionClub,
} from '../../utils/regionClubs'
import { columnMeta } from '../clubsColumnMeta'
import type { DiffEvent } from '@taverns-red/shared-contracts'

afterEach(cleanup)

const currentYear = {
  totalMembership: 1000,
  distinguishedClubs: 10,
  thrivingClubs: 5,
  totalClubs: 20,
}

describe('YearOverYearComparison names its basis (#2712)', () => {
  const renderYoY = (membershipChange: number, distinguishedChange: number) =>
    render(
      <YearOverYearComparison
        yearOverYear={{
          membershipChange,
          distinguishedChange,
          clubHealthChange: 10,
        }}
        currentYear={currentYear}
      />
    )

  it('has no "Overall Improvement" or "Overall Decline" headline', () => {
    renderYoY(5, 20)
    expect(screen.queryByText(/Overall Improvement/i)).toBeNull()
    cleanup()
    renderYoY(-5, -20)
    expect(screen.queryByText(/Overall Decline/i)).toBeNull()
  })

  it('labels each card change with the basis it is measured against', () => {
    renderYoY(5, 20)
    expect(
      screen.getAllByText(/Change since this time last year/i)
    ).toHaveLength(3)
  })

  it('states the basis in the headline summary', () => {
    renderYoY(5, 20)
    expect(
      screen.getByText(/higher than at this time last program year/i)
    ).toBeInTheDocument()
  })
})

describe('ChangeGroup net names the dates it spans (#2712)', () => {
  const event: DiffEvent = {
    category: 'membership',
    clubId: '123',
    clubName: 'Acme Club',
    label: 'Acme Club gained 5 members',
    magnitude: 5,
  }

  it('reads "net +5 since Nov 3" when given the earlier date', () => {
    // `since` is the page's resolved from-date, passed down (R3).
    render(
      <MemoryRouter>
        <ChangeGroup
          category="membership"
          heading="Membership changes"
          events={[event]}
          districtId="61"
          collapsed={false}
          onToggle={() => {}}
          since="Nov 3"
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('changes-group-net')).toHaveTextContent(
      'net +5 since Nov 3'
    )
  })
})

describe('region club list net growth names its basis (#2712)', () => {
  it('says "since the start of the program year", never July 1', () => {
    const club = {
      clubId: '1',
      membershipBase: 10,
      membershipTrend: [{ date: '2026-11-01', count: 13 }],
      dcpGoalsTrend: [],
    } as unknown as RegionClub
    expect(regionClubMetricText(club, 'netGrowth')).toBe(
      '+3 since the start of the program year'
    )
  })

  it('shows no change value when the club has no base (not total members)', () => {
    const club = {
      clubId: '2',
      membershipBase: null,
      membershipTrend: [{ date: '2026-11-01', count: 13 }],
      dcpGoalsTrend: [],
    } as unknown as RegionClub
    expect(regionClubMetric(club, 'netGrowth')).toBeNull()
    expect(regionClubMetricText(club, 'netGrowth')).toBe('no base recorded')
  })

  it('ranks clubs with no base last', () => {
    const mk = (id: string, base: number | null) =>
      ({
        clubId: id,
        membershipBase: base,
        membershipTrend: [{ date: '2026-11-01', count: 13 }],
        dcpGoalsTrend: [],
      }) as unknown as RegionClub
    expect(
      sortRegionClubs([mk('a', null), mk('b', 12)], 'netGrowth').map(
        c => c.clubId
      )
    ).toEqual(['b', 'a'])
  })
})

describe('clubs Trend column hint uses the same basis (#2712)', () => {
  it('says "since the start of the program year", not "since the base"', () => {
    expect(columnMeta.netChange!.hint).toContain(
      'since the start of the program year'
    )
  })
})
