/**
 * Landing page axe scan in the LOADED state (#1360).
 *
 * `pages/__tests__/DistrictsPage.a11y.test.tsx` already scans this page, and it
 * has been green throughout — because it renders with no CDN mocks at all, so
 * axe only ever walks the loading skeleton. The hero search toolbar, the
 * Regions row, the Recognition chips and the Awards Race cards never mount
 * there, and everything they carry was therefore unscanned. Running axe-core
 * against the deployed page found a critical the unit suite could not see:
 *
 *   .districts-toolbar__search-input — ARIA attribute is not allowed:
 *   aria-expanded="false"
 *
 * This file closes that gap: mount the page with data, wait for the real table,
 * and scan in both themes. It is the structural half of the pair — axe's
 * `color-contrast` rule is auto-disabled under JSDOM (Lesson 075, no layout
 * engine), so contrast for this surface is owned by
 * `LandingLightModeContrast.test.ts` and `LandingStaticDarkModeContrast.test.ts`.
 *
 * Routes to the integration project via `__tests__/accessibility/` (R22 —
 * a page mount must never land in the fast unit project).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, cleanup } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import DistrictsPage from '../../pages/DistrictsPage'
import { fetchCdnRankings, fetchCdnCompetitiveAwards } from '../../services/cdn'
import { renderWithProviders } from '../test-utils'

expect.extend(toHaveNoViolations)

// A full-page mount plus a whole-tree axe walk. Same honest categorization as
// the sibling page scans (#473) — this is not a fast unit test.
vi.setConfig({ testTimeout: 20000 })

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnRankingsForDate: vi.fn(),
  fetchCdnCompetitiveAwards: vi.fn(),
  fetchLatestSnapshotDate: vi.fn().mockResolvedValue('2026-05-18'),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

const mkRanking = (id: string, rank: number, region: string) => ({
  districtId: id,
  districtName: `District ${id}`,
  region,
  paidClubs: 75,
  paidClubBase: 70,
  clubGrowthPercent: 7.1,
  totalPayments: 2800,
  paymentBase: 2600,
  paymentGrowthPercent: 7.7,
  activeClubs: 75,
  distinguishedClubs: 35,
  selectDistinguished: 15,
  presidentsDistinguished: 8,
  distinguishedPercent: 50,
  clubsRank: rank,
  paymentsRank: rank,
  distinguishedRank: rank,
  aggregateScore: 300 - rank * 10,
  overallRank: rank,
})

const noAwards = {
  extensionRank: 0,
  extensionValue: 0,
  extensionIsWinner: false,
  twentyPlusRank: 0,
  twentyPlusValue: 0,
  twentyPlusIsWinner: false,
  retentionRank: 0,
  retentionValue: 0,
  retentionIsWinner: false,
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  vi.mocked(fetchCdnRankings).mockResolvedValue({
    rankings: [mkRanking('102', 1, '13'), mkRanking('59', 2, '02')],
    asOfDate: '2026-05-18',
  } as never)
  // Winners on every race so the gold `--won` status footer renders — the
  // Awards Race section is a separate query from the rankings (tripwire in
  // CLAUDE.md) and would otherwise stay in its skeleton.
  vi.mocked(fetchCdnCompetitiveAwards).mockResolvedValue({
    metadata: {
      snapshotId: '2026-05-18',
      calculatedAt: '2026-05-18T00:00:00Z',
      totalDistricts: 2,
    },
    extensionAward: [],
    twentyPlusAward: [],
    retentionAward: [],
    byDistrict: {
      '102': {
        ...noAwards,
        extensionIsWinner: true,
        twentyPlusIsWinner: true,
        retentionIsWinner: true,
      },
      '59': { ...noAwards },
    },
    distinguishedDistrict: {},
  } as never)
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  cleanup()
})

const renderLoaded = async () => {
  const view = renderWithProviders(<DistrictsPage />, { initialEntries: ['/'] })
  await screen.findByTestId('district-row-102')
  return view
}

describe('Landing page axe scan, loaded state (#1360)', () => {
  it('puts no disallowed ARIA attribute on the hero search input', async () => {
    const { container } = await renderLoaded()
    const results = await axe(container, {
      runOnly: { type: 'rule', values: ['aria-allowed-attr'] },
    })
    expect(results).toHaveNoViolations()
  })

  it('has no structural a11y violations in light mode', async () => {
    const { container } = await renderLoaded()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no structural a11y violations in dark mode', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    const { container } = await renderLoaded()
    expect(await axe(container)).toHaveNoViolations()
  })
})
