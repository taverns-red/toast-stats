/**
 * The Overview panel's heading on the phone hub (#1842 follow-up).
 *
 * Below 768 the page opens on the Overview hub (tiles, Needs attention,
 * section rows), and the context bar already names the page. The panel that
 * follows the hub kept its "Overview" h2, which then sat ~1,185px down below
 * the section rows and read as a broken layout. On the hub the page passes
 * `heading="Details"` (what that content is); everywhere else it stays
 * "Overview". The skeleton must carry the same heading so the slot matches.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DistrictOverview, DistrictOverviewSkeleton } from '../DistrictOverview'

vi.mock('../../hooks/useDistrictAnalytics', () => ({
  useDistrictAnalytics: vi.fn(() => ({
    data: undefined,
    isLoading: false,
    error: null,
  })),
}))

vi.mock('../../hooks/useDistrictRanking', () => ({
  useDistrictRanking: vi.fn(() => ({ ranking: null })),
}))

afterEach(() => cleanup())

const renderUi = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

describe('DistrictOverview heading (#1842)', () => {
  it('defaults to "Overview"', () => {
    renderUi(<DistrictOverview districtId="61" programYear="2026-2027" />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Overview' })
    ).toBeInTheDocument()
  })

  it('uses the heading the page passes', () => {
    renderUi(
      <DistrictOverview
        districtId="61"
        programYear="2026-2027"
        heading="Details"
      />
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Details' })
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull()
  })

  it('the skeleton carries the same heading', () => {
    renderUi(
      <DistrictOverviewSkeleton programYear="2026-2027" heading="Details" />
    )
    expect(
      screen.getByRole('heading', { level: 2, name: 'Details' })
    ).toBeInTheDocument()
  })

  it('the page retitles the panel on the hub layout only', () => {
    const page = readFileSync(
      join(__dirname, '../../pages/DistrictDetailPage.tsx'),
      'utf-8'
    )
    const calls =
      page.match(/<DistrictOverview(?:Skeleton)?\s[\s\S]*?\/>/g) ?? []
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call).toMatch(/heading=\{isHubLayout \? 'Details' : 'Overview'\}/)
    }
  })
})
