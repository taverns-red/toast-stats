/**
 * DistrictOverview loading slot (#1647).
 *
 * The Overview panel used to (a) mount only once the date index had landed and
 * (b) show three 1-row stat bars while its analytics loaded, then grow into a
 * subtitle + CSP line + two-up composition grid: 208→360px on desktop and
 * 468→717px on mobile, shifting every block below it. The skeleton now lays
 * out the loaded panel's own structure (Lesson 158) and the page renders it
 * while the dates are still pending.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { DistrictOverview, DistrictOverviewSkeleton } from '../DistrictOverview'

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: undefined,
    isLoading: true,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictRanking', () => ({
  useDistrictRanking: vi.fn(() => ({ ranking: null })),
}))

afterEach(() => cleanup())

const renderUi = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

describe('DistrictOverview loading slot (#1647)', () => {
  it('renders the structural skeleton while analytics load', () => {
    renderUi(<DistrictOverview districtId="61" programYear="2026-2027" />)
    expect(screen.getByTestId('district-overview-skeleton')).toBeInTheDocument()
  })

  it('reserves the subtitle line and the two-up composition grid', () => {
    renderUi(<DistrictOverviewSkeleton programYear="2026-2027" />)
    const skeleton = screen.getByTestId('district-overview-skeleton')
    expect(skeleton).toHaveClass('redesign-panel')
    expect(
      within(skeleton).getByRole('heading', { name: 'Overview' })
    ).toBeInTheDocument()
    expect(
      within(skeleton).getByTestId('district-overview-skeleton-subtitle')
    ).toBeInTheDocument()
    const grid = within(skeleton).getByTestId(
      'district-overview-skeleton-composition'
    )
    // Same grid the loaded composition bar + payment card sit in.
    expect(grid).toHaveClass('grid', 'min-[980px]:grid-cols-2')
    expect(grid.children).toHaveLength(2)
    expect(grid).toHaveAttribute('aria-hidden', 'true')
  })

  it('reserves the CSP line only for a year that requires a plan', () => {
    renderUi(<DistrictOverviewSkeleton programYear="2026-2027" />)
    expect(
      screen.getByTestId('district-overview-skeleton-csp')
    ).toBeInTheDocument()
    cleanup()
    renderUi(<DistrictOverviewSkeleton programYear="2024-2025" />)
    expect(
      screen.queryByTestId('district-overview-skeleton-csp')
    ).not.toBeInTheDocument()
  })
})
