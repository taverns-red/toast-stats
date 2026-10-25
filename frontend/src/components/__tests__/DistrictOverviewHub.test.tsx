/**
 * District Overview hub for phones (#1842, mobile epic #1827 Phase 2,
 * review §5.5): context bar → 2×2 KPI tiles (number · delta · rank only,
 * details in a per-tile sheet) → "Needs attention" (≤3 rows + a link to the
 * Action List) → sections as rows with counts.
 *
 * jsdom proves structure and behaviour. The first-screen geometry (tile block
 * height, 2-up columns with no side toggle, page ≤ 4,000 px) is proven on the
 * deployed preview by `e2e/district-overview-hub-mobile.smoke.ts`.
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import {
  render as rtlRender,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { DistrictOverviewHub } from '../DistrictOverviewHub'
import { nextTierText } from '../../utils/districtHub'
import type { DistrictKpiStripData } from '../DistrictKpiStrip'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'

afterEach(cleanup)

const render = (ui: ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const TARGETS = {
  distinguished: 160,
  select: 163,
  presidents: 166,
  smedley: 171,
}
const RANKINGS = {
  worldRank: 36,
  worldPercentile: 62,
  regionRank: 3,
  totalDistricts: 94,
  totalInRegion: 9,
  region: '05',
}

const KPIS: DistrictKpiStripData = {
  paidClubs: { current: 137, targets: TARGETS, rankings: RANKINGS },
  membershipPayments: {
    current: 3385,
    targets: {
      distinguished: 5945,
      select: 6063,
      presidents: 6181,
      smedley: 6357,
    },
    rankings: { ...RANKINGS, worldRank: 15 },
  },
  distinguishedClubs: {
    current: 5,
    targets: { distinguished: 55, select: 60, presidents: 64, smedley: 69 },
    rankings: { ...RANKINGS, worldRank: 1 },
  },
  netMemberChange: { current: -2501 },
}

function makeClub(overrides: Partial<ClubTrend> = {}): ClubTrend {
  return {
    clubId: 'c1',
    clubName: 'Club One',
    divisionId: 'A',
    areaId: 'A1',
    areaName: 'Area A1',
    membershipTrend: [
      { date: '2025-07-01', count: 18 },
      { date: '2026-06-01', count: 18 },
    ],
    dcpGoalsTrend: [
      { date: '2025-07-01', goalsAchieved: 0 },
      { date: '2026-06-01', goalsAchieved: 4 },
    ],
    membershipBase: 18,
    aprilRenewals: null,
    cspSubmitted: true,
    currentStatus: 'thriving',
    distinguishedLevel: 'NotDistinguished',
    ...overrides,
  } as ClubTrend
}

const CLUBS: ClubTrend[] = [
  makeClub({ clubId: 'close-1', clubName: 'Close Club' }),
  makeClub({
    clubId: 'b-1',
    clubName: 'Bee Club',
    divisionId: 'B',
    areaId: 'B1',
    dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 1 }],
    cspSubmitted: false,
  }),
  makeClub({
    clubId: 'c-1',
    clubName: 'Sea Club',
    divisionId: 'C',
    areaId: 'C1',
    dcpGoalsTrend: [{ date: '2026-06-01', goalsAchieved: 1 }],
    currentStatus: 'intervention-required',
  }),
]

const baseProps = {
  districtId: '61',
  programYear: '2026-2027',
  snapshotDate: '2026-10-11',
  kpis: KPIS,
  clubs: CLUBS,
  interventionClubs: CLUBS.filter(
    c => c.currentStatus === 'intervention-required'
  ),
}

describe('nextTierText', () => {
  it('names the gap to the next tier below Distinguished', () => {
    expect(nextTierText(137, TARGETS)).toBe('23 to Distinguished')
  })
  it('names the next tier once a lower one is reached', () => {
    expect(nextTierText(161, TARGETS)).toBe('2 to Select')
    expect(nextTierText(165, TARGETS)).toBe("1 to President's")
  })
  it('says the top tier is reached', () => {
    expect(nextTierText(171, TARGETS)).toBe('Smedley reached')
  })
  it('returns null without targets', () => {
    expect(nextTierText(5, null)).toBeNull()
  })
})

describe('DistrictOverviewHub', () => {
  it('renders four KPI tiles carrying number, delta and rank only', () => {
    render(<DistrictOverviewHub {...baseProps} />)
    const tiles = screen.getAllByTestId('district-hub-tile')
    expect(tiles).toHaveLength(4)
    const paid = tiles[0]!
    expect(paid).toHaveTextContent('Paid Clubs')
    expect(paid).toHaveTextContent('137')
    expect(paid).toHaveTextContent('23 to Distinguished')
    expect(paid).toHaveTextContent('#36 of 94')
    // No tier legend, percentile, region chip or bullet bar on the tile.
    expect(paid).not.toHaveTextContent('percentile')
    expect(within(paid).queryByRole('progressbar')).toBeNull()
    const net = tiles[3]!
    expect(net).toHaveTextContent('Net Member Change')
    expect(net).toHaveTextContent('−2,501')
  })

  it('has no info tooltips and no collapse toggle', () => {
    render(<DistrictOverviewHub {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'More info' })).toBeNull()
    expect(screen.queryByRole('button', { name: /KPI strip/ })).toBeNull()
  })

  it('opens a per-tile sheet with the full detail', () => {
    render(<DistrictOverviewHub {...baseProps} />)
    fireEvent.click(screen.getAllByTestId('district-hub-tile')[0]!)
    const sheet = screen.getByRole('dialog', { name: 'Paid Clubs' })
    expect(within(sheet).getByRole('progressbar')).toBeInTheDocument()
    expect(sheet).toHaveTextContent('percentile')
    expect(sheet).toHaveTextContent('Distinguished District recognition')
  })

  it('lists what needs attention, linking into the Action List sections', () => {
    render(<DistrictOverviewHub {...baseProps} />)
    const block = screen.getByRole('region', { name: 'Needs attention' })
    const rows = within(block).getAllByTestId('mobile-row')
    expect(rows.length).toBeLessThanOrEqual(3)
    const hrefs = rows.map(r => r.getAttribute('href'))
    expect(hrefs).toContain('/district/61/action-list#action-close')
    expect(hrefs).toContain('/district/61/action-list#action-intervention')
    expect(hrefs).toContain('/district/61/action-list#action-csp')
    const close = rows.find(r =>
      r.getAttribute('href')?.endsWith('#action-close')
    )!
    expect(close).toHaveTextContent('Clubs close to Distinguished')
    expect(close).toHaveTextContent('1')
    expect(
      within(block).getByRole('link', { name: /Open the Action List/ })
    ).toHaveAttribute('href', '/district/61/action-list')
  })

  it('drops the Club Success Plan row for a year with no requirement', () => {
    render(<DistrictOverviewHub {...baseProps} programYear="2024-2025" />)
    const block = screen.getByRole('region', { name: 'Needs attention' })
    const hrefs = within(block)
      .getAllByTestId('mobile-row')
      .map(r => r.getAttribute('href'))
    expect(hrefs).not.toContain('/district/61/action-list#action-csp')
  })

  it('has no Sections list — the bottom bar and its More sheet carry the sections (#2093)', () => {
    render(<DistrictOverviewHub {...baseProps} />)
    expect(screen.queryByTestId('district-hub-sections')).toBeNull()
    expect(
      screen.queryByRole('navigation', { name: 'District sections list' })
    ).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sections' })).toBeNull()
  })

  it('holds the same structure while loading (structural skeleton)', () => {
    render(<DistrictOverviewHub {...baseProps} kpis={null} clubs={null} />)
    const hub = screen.getByTestId('district-hub-mobile')
    expect(hub).toHaveClass('district-hub--loading')
    expect(hub).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByTestId('district-hub-tile')).toHaveLength(4)
    // Same row count as the loaded CSP-tracked year: close, intervention, CSP.
    expect(
      within(screen.getByTestId('district-hub-attention')).getAllByTestId(
        'mobile-row'
      )
    ).toHaveLength(3)
  })
})

describe('DistrictOverviewHub — officer training in Needs attention (#2296, N10)', () => {
  const trainingClubs = [
    {
      clubId: '1',
      clubName: 'Short Club',
      divisionId: 'A',
      areaId: '01',
      round1: 7,
      round2: 2,
      clubStatus: 'Active',
    },
  ]
  it('counts only in the last 30 days of the open round (Jan 30: 30 left)', () => {
    render(
      <DistrictOverviewHub
        {...baseProps}
        snapshotDate="2027-01-30"
        trainingClubs={trainingClubs}
      />
    )
    expect(screen.getByTestId('district-hub-attention')).toHaveTextContent(
      'Clubs short of officer training'
    )
  })

  it('does not count earlier in the round (Jan 29: 31 left)', () => {
    render(
      <DistrictOverviewHub
        {...baseProps}
        snapshotDate="2027-01-29"
        trainingClubs={trainingClubs}
      />
    )
    expect(screen.getByTestId('district-hub-attention')).not.toHaveTextContent(
      'Clubs short of officer training'
    )
  })
})
