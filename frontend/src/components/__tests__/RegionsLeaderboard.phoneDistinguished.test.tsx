/* #2580: the phone priority-columns smoke forbids td text under 14px, so the
 * 12px "+N qualifying today" stays out of the compact phone table. */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => true }))

afterEach(() => cleanup())

const rollup = {
  region: '01',
  districtCount: 8,
  paidClubs: 500,
  paidClubBase: 480,
  clubGrowthPercent: 4,
  paymentGrowthPercent: 9,
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
} as RegionRollup

describe('RegionsLeaderboard phone view (#2580)', () => {
  it('shows the confirmed count and share, not the 12px extra', () => {
    render(
      <MemoryRouter>
        <RegionsLeaderboard
          rollups={[rollup]}
          provisionalByRegion={new Map([['01', 12]])}
        />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dist. clubs' }))
    const table = screen.getByRole('table', { name: 'Region rankings' })
    expect(table).toHaveTextContent('200')
    expect(table).toHaveTextContent('40%')
    expect(
      table.querySelector('[data-testid="distinguished-provisional"]')
    ).toBeNull()
  })
})
