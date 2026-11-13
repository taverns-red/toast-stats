/* #2580 group 2: the regions leaderboard's Distinguished cell is the
 * confirmed count with "+N qualifying today" beside it, from the pipeline's
 * per-region pair; % stays on the confirmed basis. */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'

afterEach(() => cleanup())

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

const rollups = [
  mkRollup({ region: '01', aggregateScore: 1500 }),
  mkRollup({ region: '02', aggregateScore: 900 }),
]

describe('RegionsLeaderboard — qualifying today (#2580)', () => {
  it('shows +N qualifying today in the Distinguished cell, none for 0 or unknown', async () => {
    render(
      <MemoryRouter initialEntries={['/regions?sort=distinguished&dir=desc']}>
        <RegionsLeaderboard
          rollups={rollups}
          provisionalByRegion={new Map([['01', 12]])}
        />
      </MemoryRouter>
    )
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row')
    const r1 = rows.find(r => /Region 01|^01|\b01\b/.test(r.textContent ?? ''))!
    expect(
      within(r1).getByTestId('distinguished-provisional')
    ).toHaveTextContent('+12 qualifying today')
    expect(
      within(table).getAllByTestId('distinguished-provisional')
    ).toHaveLength(1)
    expect(within(r1).getByTestId('distinguished-confirmed')).toHaveTextContent(
      /^200$/
    )
  })
})
