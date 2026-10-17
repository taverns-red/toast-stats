import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'

/* #2127 — one membership sparkline per region on /regions, from the one
   time-series/regions/{PY}.json file. `trends` undefined = still loading
   (the box is reserved), a Map = drawn, null = the file is not published
   (404 until it reaches prod): no Trend column at all, never a flat line. */

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.value }))

afterEach(() => {
  cleanup()
  mobile.value = false
})

const mkRollup = (region: string): RegionRollup => ({
  region,
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
})

const ROLLUPS = [mkRollup('01'), mkRollup('05')]
const TRENDS = new Map<string, number[] | null>([
  ['01', [12000, 12500, 12945]],
  ['05', [13000, 13278]],
])

const renderBoard = (trends?: ReadonlyMap<string, number[] | null> | null) =>
  render(
    <MemoryRouter>
      <RegionsLeaderboard rollups={ROLLUPS} trends={trends} />
    </MemoryRouter>
  )

const table = () => screen.getByRole('table', { name: 'Region rankings' })

describe('RegionsLeaderboard membership trend (#2127)', () => {
  it('≥768: a Trend column with one sparkline per region', () => {
    renderBoard(TRENDS)
    const headers = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(headers[1]).toBe('Trend')
    expect(
      within(table()).getByRole('img', {
        name: 'Membership 12,000 → 12,945 this program year, net +945',
      })
    ).toBeInTheDocument()
    expect(
      within(table()).getByRole('img', { name: /Membership 13,000 → 13,278/ })
    ).toBeInTheDocument()
  })

  it('no file (null): no Trend column and no sparkline — the table is as before', () => {
    renderBoard(null)
    const headers = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(headers).not.toContain('Trend')
    expect(headers).toHaveLength(6)
    expect(within(table()).queryAllByRole('img')).toHaveLength(0)
  })

  it('loading (undefined): the column is reserved, nothing drawn yet', () => {
    renderBoard(undefined)
    const headers = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(headers[1]).toBe('Trend')
    expect(within(table()).queryAllByRole('img')).toHaveLength(0)
  })

  it('a region the file does not hold says so in words', () => {
    renderBoard(new Map([['01', [1, 2]]]))
    expect(
      within(table()).getByText('No membership trend for this date')
    ).toBeInTheDocument()
  })

  it('<768: the sparkline rides on its own line in the row identity', () => {
    mobile.value = true
    renderBoard(TRENDS)
    const img = within(table()).getByRole('img', {
      name: /Membership 12,000 → 12,945/,
    })
    expect(img.parentElement).toHaveClass('region-identity__trend')
    expect(img.closest('a')).toHaveAttribute('href', '/region/01')
  })

  it('<768 with no file: no trend line in the identity', () => {
    mobile.value = true
    renderBoard(null)
    expect(table().querySelector('.region-identity__trend')).toBeNull()
  })
})
