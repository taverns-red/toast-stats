import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type {
  GlobalClubRace,
  GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import { WorldwideStandingCard } from '../WorldwideStandingCard'

/**
 * #1556 — the club page's "Worldwide standing" card. Every club gets a
 * cohort percentile (private, band-based, "top X %"); a RANK appears only
 * for a club that has reached a tier, with the reach window and a deep link
 * into that tier's race. A club that has not reached is never numbered.
 */

const hist = (...pairs: Array<[number, number]>): number[] => {
  const h = Array.from({ length: 11 }, () => 0)
  for (const [goals, n] of pairs) h[goals] = n
  return h
}

const RACE: GlobalClubRace = {
  _format: { version: '1.0.0', type: 'global-club-race' },
  date: '2026-09-11',
  programYear: '2026-2027',
  generatedAt: '2026-09-11T10:00:00.000Z',
  scope: {
    districts: { total: 1, numbered: 1, includesUndistricted: false },
    clubsScanned: 100,
    excludedDistricts: [],
    missingDistricts: [],
    reachedAbsentToday: 0,
    officialWithoutDerived: 0,
  },
  ruleset: {
    programYear: '2026-2027',
    cspRequired: true,
    smedleyAvailable: true,
    membershipBasis: 'confirmed-renewals',
    officialRecognitionFrom: '2027-04-01',
    tiers: [],
  },
  observation: {
    firstObservedDate: '2026-07-26',
    previousSnapshotDate: '2026-09-10',
    observedDates: 3,
    resolution: 'daily',
  },
  timeline: [],
  distribution: {
    goalsMet: hist([0, 50], [3, 30], [5, 15], [8, 5]),
    membership: { lt12: 40, from12to19: 30, from20to24: 20, ge25: 10 },
    byTierRequirementsMet: {
      none: 80,
      Distinguished: 15,
      Select: 5,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 100, D: 0, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: hist([0, 35], [3, 5]),
      from12to19: hist([0, 15], [3, 15]),
      from20to24: hist([3, 10], [5, 8], [8, 2]),
      ge25: hist([3, 0], [5, 7], [8, 3]),
    },
  },
  reached: [],
  byDistrict: [],
}

const REACHED: GlobalClubRaceReached = {
  clubId: '3045',
  clubName: 'Limestone City Club',
  districtId: '61',
  current: null,
  tiers: {
    Distinguished: {
      reachedOn: '2026-08-12',
      observedAfter: '2026-08-11',
      rank: 37,
    },
    Select: { reachedOn: '2026-09-04', observedAfter: '2026-08-31', rank: 4 },
  },
  official: null,
}

const renderCard = (
  props: Partial<React.ComponentProps<typeof WorldwideStandingCard>> = {}
) =>
  render(
    <MemoryRouter>
      <WorldwideStandingCard
        race={RACE}
        clubId="3045"
        goalsMet={5}
        members={22}
        reached={null}
        {...props}
      />
    </MemoryRouter>
  )

describe('WorldwideStandingCard (#1556)', () => {
  it('shows the cohort percentile for any club, as "top X %"', () => {
    renderCard()
    const card = screen.getByRole('region', { name: 'Worldwide standing' })
    expect(card).toHaveTextContent('Top 20% of clubs worldwide by goals met')
    expect(card).toHaveTextContent('top 50% among clubs with 20–24 members')
    expect(card).not.toHaveTextContent(/th club in the world/)
  })

  it('shows the highest reached tier, its rank, window and a deep link', () => {
    renderCard({ reached: REACHED, goalsMet: 7 })
    const card = screen.getByRole('region', { name: 'Worldwide standing' })
    expect(card).toHaveTextContent(
      '4th club in the world to reach Select Distinguished (between 31 Aug and 4 Sep)'
    )
    expect(
      screen.getByRole('link', { name: /See the Select Distinguished race/ })
    ).toHaveAttribute('href', '/clubs/race/select?highlight=3045')
  })

  it('never shows a rank for a club that has not reached', () => {
    renderCard()
    expect(screen.queryByText(/club in the world/)).toBeNull()
    expect(
      screen.getByRole('link', { name: /Clubs worldwide/ })
    ).toHaveAttribute('href', '/clubs')
  })

  it('renders nothing when the race is not available', () => {
    renderCard({ race: null })
    expect(
      screen.queryByRole('region', { name: 'Worldwide standing' })
    ).toBeNull()
  })
})
