/**
 * Tests for ClubGridTile (#1230, epic #1228) — one colour-coded tile per club
 * in the at-a-glance district grid. The tile is a real <Link>; colour is never
 * the only signal (WCAG 1.4.1), so every assertion here also pins the textual
 * status + DCP carried in the accessible name.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ClubGridTile } from '../ClubGridTile'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { GridColorMode } from '../../utils/clubGridColor'

function club(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: '123',
    clubName: 'Test Speakers',
    divisionId: 'A',
    divisionName: 'Division A',
    areaId: '1',
    areaName: 'Area 1',
    membershipTrend: [{ date: '2026-06-01', count: 20 }],
    dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 7 }],
    currentStatus: 'thriving',
    riskFactors: [],
    distinguishedLevel: 'Distinguished',
    ...overrides,
  } as ClubTrend
}

const renderTile = (
  props: Partial<{
    club: ClubTrend
    districtId: string
    colorMode: GridColorMode
  }> = {}
) =>
  render(
    <MemoryRouter>
      <ClubGridTile
        club={props.club ?? club()}
        districtId={props.districtId ?? '61'}
        colorMode={props.colorMode ?? 'health'}
      />
    </MemoryRouter>
  )

describe('ClubGridTile', () => {
  it('is a real link to the club detail route', () => {
    renderTile()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/district/61/club/123')
  })

  it('shows the club name', () => {
    renderTile()
    expect(screen.getByText('Test Speakers')).toBeInTheDocument()
  })

  it('exposes an accessible name carrying status + DCP (colour not sole signal)', () => {
    renderTile({ colorMode: 'health' })
    const name = screen.getByRole('link').getAttribute('aria-label') ?? ''
    expect(name).toContain('Test Speakers')
    expect(name).toContain('Thriving')
    expect(name).toContain('7/10')
  })

  it('renders the DCP signal text visibly', () => {
    renderTile()
    expect(screen.getByText('7/10')).toBeInTheDocument()
  })

  it('renders a non-colour status glyph that is aria-hidden (decorative)', () => {
    const { container } = renderTile({ colorMode: 'health' })
    const glyph = container.querySelector('.club-grid-tile__glyph')
    expect(glyph).not.toBeNull()
    expect(glyph).toHaveTextContent('✓')
    expect(glyph).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies the health modifier class in health mode', () => {
    renderTile({
      club: club({ currentStatus: 'intervention-required' }),
      colorMode: 'health',
    })
    expect(screen.getByRole('link').className).toContain(
      'club-grid-tile--intervention'
    )
  })

  it('applies the tier modifier class and tier label in tier mode', () => {
    renderTile({
      club: club({ distinguishedLevel: 'Select' }),
      colorMode: 'tier',
    })
    const link = screen.getByRole('link')
    expect(link.className).toContain('club-grid-tile--tier-select')
    expect(link.getAttribute('aria-label')).toContain('Select')
  })

  it('marks a suspended club distinctly in either mode', () => {
    renderTile({
      club: club({ clubStatus: 'Suspended' }),
      colorMode: 'tier',
    })
    const link = screen.getByRole('link')
    expect(link.className).toContain('club-grid-tile--suspended')
    expect(link.getAttribute('aria-label')).toContain('Suspended')
  })
})
