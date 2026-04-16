import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AwardsRaceSection } from '../AwardsRaceSection'
import type { CompetitiveAwardStandings } from '../../services/cdn'

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

const mockStandings: CompetitiveAwardStandings = {
  metadata: {
    snapshotId: '2026-04-15',
    calculatedAt: '2026-04-15T00:00:00.000Z',
    totalDistricts: 5,
  },
  extensionAward: [
    {
      districtId: '1',
      districtName: 'District 1',
      region: '1',
      rank: 1,
      value: 15,
      isWinner: true,
    },
    {
      districtId: '2',
      districtName: 'District 2',
      region: '2',
      rank: 2,
      value: 10,
      isWinner: true,
    },
    {
      districtId: '3',
      districtName: 'District 3',
      region: '3',
      rank: 3,
      value: 5,
      isWinner: true,
    },
    {
      districtId: '4',
      districtName: 'District 4',
      region: '4',
      rank: 4,
      value: 0,
      isWinner: false,
    },
  ],
  twentyPlusAward: [
    {
      districtId: '1',
      districtName: 'District 1',
      region: '1',
      rank: 1,
      value: 90,
      isWinner: true,
    },
  ],
  retentionAward: [
    {
      districtId: '1',
      districtName: 'District 1',
      region: '1',
      rank: 1,
      value: 100,
      isWinner: true,
    },
  ],
  byDistrict: {},
}

describe('AwardsRaceSection (#331)', () => {
  it('should render three competitive award leaderboards', () => {
    renderWithRouter(<AwardsRaceSection standings={mockStandings} />)

    // "Awards Race" is in a <summary> (not a heading element)
    expect(screen.getByText(/Awards Race/i)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Extension Award/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /20-Plus Award/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Retention Award/i })
    ).toBeInTheDocument()
  })

  it('should highlight top 3 winners with medals', () => {
    renderWithRouter(<AwardsRaceSection standings={mockStandings} />)

    // Each leaderboard shows winners. District 1, 2, 3 should be marked
    // as winners in the Extension award
    const winners = screen.getAllByLabelText(/winner/i)
    expect(winners.length).toBeGreaterThan(0)
  })

  it('should not render when standings is null', () => {
    const { container } = renderWithRouter(
      <AwardsRaceSection standings={null} />
    )
    // The MemoryRouter wrapper renders an empty div, so check that
    // AwardsRaceSection itself didn't render anything
    expect(container.querySelector('details')).toBeNull()
  })
})
