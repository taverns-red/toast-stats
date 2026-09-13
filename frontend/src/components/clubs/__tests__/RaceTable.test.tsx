import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { GlobalClubRaceReached } from '@taverns-red/shared-contracts'
import { RaceTable } from '../RaceTable'

/**
 * #1556 — the per-tier race table. The 10-dot goal strip renders from the
 * INDEPENDENT boolean array (fixture with non-prefix goals, so a "goals
 * 1–N" derivation would fail); the official rosette appears only when TI's
 * code is present; `?highlight=` marks one row with aria-current.
 */

/** Goals met at indices {1, 3, 4, 5, 6, 8, 9} — seven, not the first seven. */
const NON_PREFIX = [
  false,
  true,
  false,
  true,
  true,
  true,
  true,
  false,
  true,
  true,
]

const row = (
  overrides: Partial<GlobalClubRaceReached> & { clubId: string }
): GlobalClubRaceReached => ({
  clubName: `Club ${overrides.clubId}`,
  districtId: '61',
  current: {
    level: 'Select',
    activeMembersLevel: 'Select',
    goalsMet: 7,
    members: 22,
    membershipBase: 20,
    netGrowth: 2,
    aprilRenewals: 22,
    cspSubmitted: true,
    dcpGoalsAchieved: NON_PREFIX,
    divisionId: 'A',
    areaId: '01',
    country: 'Canada',
  },
  tiers: {
    Distinguished: {
      reachedOn: '2026-08-12',
      observedAfter: '2026-08-11',
      rank: 1,
    },
  },
  official: null,
  ...overrides,
})

const renderTable = (rows: GlobalClubRaceReached[], highlight?: string) =>
  render(
    <MemoryRouter>
      <RaceTable tier="Distinguished" rows={rows} highlightClubId={highlight} />
    </MemoryRouter>
  )

describe('RaceTable (#1556)', () => {
  it('renders the goal strip from the boolean array, not from the count', () => {
    renderTable([row({ clubId: '3045' })])
    const strip = screen.getByTestId('race-goal-strip-3045')
    const dots = within(strip).getAllByTestId('race-goal-dot')
    expect(dots).toHaveLength(10)
    expect(dots.map(d => d.getAttribute('data-met'))).toEqual(
      NON_PREFIX.map(String)
    )
    expect(strip).toHaveAttribute('aria-label', '7 of 10 goals met')
  })

  it('shows the official rosette only when TI’s code is present', () => {
    renderTable([
      row({ clubId: '1' }),
      row({
        clubId: '2',
        official: {
          code: 'S',
          since: '2027-04-30',
          observedAfter: '2027-03-31',
        },
      }),
    ])
    expect(screen.queryByTestId('race-official-1')).toBeNull()
    expect(screen.getByTestId('race-official-2')).toHaveTextContent(
      'Select Distinguished'
    )
  })

  it('marks the highlighted club row with aria-current', () => {
    renderTable([row({ clubId: '1' }), row({ clubId: '2' })], '2')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).not.toHaveAttribute('aria-current')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
  })

  it('shows rank, crossing window, and today’s numbers with a caption', () => {
    renderTable([row({ clubId: '3045', clubName: 'Limestone City Club' })])
    const table = screen.getByRole('table', {
      name: 'First to Distinguished — every club that has reached it this program year',
    })
    const body = within(table).getAllByRole('row')[1]!
    expect(body).toHaveTextContent('1')
    expect(body).toHaveTextContent('on 12 Aug')
    expect(body).toHaveTextContent('22')
    expect(body).toHaveTextContent('+2')
    expect(
      within(body).getByRole('link', { name: 'Limestone City Club' })
    ).toHaveAttribute('href', '/district/61/club/3045')
  })

  it('a club absent today shows its crossing with today’s numbers marked unavailable, no label', () => {
    renderTable([row({ clubId: '9', current: null })])
    const body = screen.getAllByRole('row')[1]!
    expect(body).toHaveTextContent('on 12 Aug')
    expect(body).toHaveTextContent('—')
    expect(body).not.toHaveTextContent(/lost|dropped/i)
  })
})
