import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { GlobalClubRaceReached } from '@taverns-red/shared-contracts'
import { RacePodium } from '../RacePodium'

/**
 * #1556 — the podium is an ordered list of RANKS, not of clubs: a tie on the
 * first observed date renders as one rank label with a stacked list under
 * it ("1st — 3 clubs"), never as three "1st" cards. Rank 1 carries the
 * `--rt-stats` accent class; tier colour is never the only signal.
 */
const row = (
  clubId: string,
  clubName: string,
  reachedOn: string,
  rank: number,
  observedAfter: string | null = null
): GlobalClubRaceReached => ({
  clubId,
  clubName,
  districtId: '61',
  current: null,
  tiers: { Distinguished: { reachedOn, observedAfter, rank } },
  official: null,
})

const ROWS: GlobalClubRaceReached[] = [
  row('1', 'Alpha', '2026-07-26', 1),
  row('2', 'Bravo', '2026-07-26', 1),
  row('3', 'Charlie', '2026-07-26', 1),
  row('4', 'Delta', '2026-08-12', 4, '2026-08-11'),
  row('5', 'Echo', '2026-08-19', 5, '2026-08-17'),
  row('6', 'Foxtrot', '2026-08-31', 6, '2026-08-30'),
]

const renderPodium = (rows: GlobalClubRaceReached[]) =>
  render(
    <MemoryRouter>
      <RacePodium tier="Distinguished" rows={rows} />
    </MemoryRouter>
  )

describe('RacePodium (#1556)', () => {
  it('renders an ordered list of the first three RANKS, ties stacked under one label', () => {
    renderPodium(ROWS)
    const list = screen.getByRole('list', {
      name: 'First to Distinguished',
    })
    expect(list.tagName).toBe('OL')
    const ranks = within(list).getAllByTestId('race-podium-rank')
    expect(ranks).toHaveLength(3)

    // Rank 1 is one entry holding three clubs.
    expect(ranks[0]).toHaveTextContent('1st')
    expect(ranks[0]).toHaveTextContent('3 clubs')
    expect(
      within(ranks[0]!)
        .getAllByRole('link')
        .map(l => l.textContent)
    ).toEqual(['Alpha', 'Bravo', 'Charlie'])
    // The next rank skips to 4th (competition ranking), then 5th.
    expect(ranks[1]).toHaveTextContent('4th')
    expect(ranks[2]).toHaveTextContent('5th')
    expect(screen.queryByText('Foxtrot')).toBeNull()
  })

  it('rank 1 carries the product accent class; others do not', () => {
    renderPodium(ROWS)
    const ranks = screen.getAllByTestId('race-podium-rank')
    expect(ranks[0]).toHaveClass('race-podium__rank--first')
    expect(ranks[1]).not.toHaveClass('race-podium__rank--first')
  })

  it('states the crossing window per rank, never a point for a window', () => {
    renderPodium(ROWS)
    const ranks = screen.getAllByTestId('race-podium-rank')
    expect(ranks[0]).toHaveTextContent('by 26 Jul 2026')
    expect(ranks[1]).toHaveTextContent('on 12 Aug')
    expect(ranks[2]).toHaveTextContent('between 17 Aug and 19 Aug')
  })

  it('links each club to its club page', () => {
    renderPodium(ROWS)
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveAttribute(
      'href',
      '/district/61/club/1'
    )
  })

  it('renders the empty state when no club has reached the tier', () => {
    renderPodium([])
    expect(screen.queryByRole('list')).toBeNull()
    expect(
      screen.getByText(/No club has reached Distinguished yet/)
    ).toBeInTheDocument()
  })
})
