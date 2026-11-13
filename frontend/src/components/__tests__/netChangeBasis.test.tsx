/**
 * #2712 (UX decision D9): every net change on screen says what it is measured
 * against, in plain words ("since July 1", "since this time last year"), and
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
import { regionClubMetricText, type RegionClub } from '../../utils/regionClubs'
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
    const props = { since: 'Nov 3' } as object
    render(
      <MemoryRouter>
        <ChangeGroup
          category="membership"
          heading="Membership changes"
          events={[event]}
          districtId="61"
          collapsed={false}
          onToggle={() => {}}
          {...props}
        />
      </MemoryRouter>
    )
    expect(screen.getByTestId('changes-group-net')).toHaveTextContent(
      'net +5 since Nov 3'
    )
  })
})

describe('region club list net growth names its basis (#2712)', () => {
  it('says "since July 1" beside the signed figure', () => {
    const club = {
      clubId: '1',
      membershipBase: 10,
      membershipTrend: [{ date: '2026-11-01', count: 13 }],
      dcpGoalsTrend: [],
    } as unknown as RegionClub
    expect(regionClubMetricText(club, 'netGrowth')).toBe('+3 since July 1')
  })
})
