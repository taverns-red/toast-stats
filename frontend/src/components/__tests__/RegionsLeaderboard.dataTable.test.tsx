/**
 * Regions leaderboard on the shared DataTable (#2702, #2676, spec §14 M3).
 *
 * Sort only, no Columns menu: the table has a handful of columns, so it shows
 * all of them. What the foundation adds is the contract every data table
 * shares: a caption, a row-header cell with a real link, a one-row header of
 * sortable buttons, and no text below 14px.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'

afterEach(() => cleanup())

const LocationProbe = () => {
  const { pathname } = useLocation()
  return <output data-testid="location">{pathname}</output>
}

const mkRollup = (overrides: Partial<RegionRollup>): RegionRollup => ({
  region: '01',
  districtCount: 8,
  paidClubs: 500,
  paidClubBase: 480,
  clubGrowthPercent: 4.16,
  paymentGrowthPercent: 9.09,
  totalPayments: 12000,
  paymentBase: 11000,
  distinguishedClubs: 200,
  distinguishedPercent: 40,
  clubsRank: 1,
  paymentsRank: 1,
  distinguishedRank: 1,
  aggregateScore: 1500,
  leadingDistrictId: '01',
  leadingDistrictName: 'District 01',
  requirements: {
    dspSubmitted: { met: 7, total: 8 },
    trainingMet: { met: 8, total: 8 },
    marketAnalysisSubmitted: { met: 6, total: 8 },
    communicationPlanSubmitted: { met: 7, total: 8 },
    regionAdvisorVisitMet: { met: 8, total: 8 },
  },
  ...overrides,
})

const rollups: RegionRollup[] = [
  mkRollup({ region: '03', aggregateScore: 900, paidClubs: 300 }),
  mkRollup({ region: '01', aggregateScore: 1500, paidClubs: 700 }),
]

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/regions']}>
      <RegionsLeaderboard rollups={rollups} />
      <LocationProbe />
    </MemoryRouter>
  )

describe('RegionsLeaderboard on the DataTable (#2702)', () => {
  it('is a DataTable with a caption that says what and how many', () => {
    setup()
    const table = screen.getByRole('table', { name: /region rankings/i })
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent).toMatch(
      /region rankings.*2 regions/i
    )
  })

  it('makes the region cell the row header, with a real link', () => {
    setup()
    const table = screen.getByRole('table', { name: /region rankings/i })
    const cell = table.querySelector('tbody th')!
    expect(cell).toHaveAttribute('scope', 'row')
    expect(cell.querySelector('a')).toHaveAttribute('href', '/region/01')
  })

  it('has one header row and no Columns menu (sort only)', () => {
    setup()
    const table = screen.getByRole('table', { name: /region rankings/i })
    expect(table.querySelectorAll('thead tr')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Columns/ })).toBeNull()
  })

  it('sorts from the header and keeps the region link as the only way in', () => {
    setup()
    const table = screen.getByRole('table', { name: /region rankings/i })
    fireEvent.click(screen.getByRole('button', { name: /sort by paid clubs/i }))
    const first = table.querySelector('tbody tr th')!
    expect(first.textContent).toMatch(/Region 01/)
    fireEvent.click(table.querySelector('tbody tr')!)
    expect(screen.getByTestId('location')).toHaveTextContent('/regions')
  })

  it('sets no text below the 14px floor on the table', () => {
    setup()
    const table = screen.getByRole('table', { name: /region rankings/i })
    expect(table.innerHTML).not.toMatch(/\btext-(?:xs|\[(?:9|1[0-3])px\])/)
  })
})
