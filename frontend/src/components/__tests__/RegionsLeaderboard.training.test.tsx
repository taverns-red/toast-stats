import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'
import { regionsTrainingOverview } from '../../utils/regionTraining'

/* #2330 — officer training on /regions: each region's % of clubs with 4+
   officers trained (DCP goal 9) and with all seven, per round, sortable,
   each linking to /region/:n/training. Round 2 before Nov 1 reads "not
   started"; a date without the figures reads "not available", never 0%. */

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

const ROLLUPS = [mkRollup('01'), mkRollup('02'), mkRollup('03')]

const dist = (atZero: number, atFour: number, atSeven: number) => [
  atZero,
  0,
  0,
  0,
  atFour,
  0,
  0,
  atSeven,
]

const FILE = {
  world: {
    officerTraining: { round1: dist(2, 5, 3), round2: dist(10, 0, 0) },
  },
  regions: {
    // 01: 50% at 4+, 25% all seven. 02: 75%, 50%. 03: no figures.
    '01': { officerTraining: { round1: dist(2, 1, 1), round2: dist(4, 0, 0) } },
    '02': { officerTraining: { round1: dist(1, 1, 2), round2: dist(4, 0, 0) } },
    '03': { officerTraining: null },
  },
} as unknown as RegionRollups

const OCT = regionsTrainingOverview(FILE, '2026-10-25', '2026-2027')

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.search}</div>
}

const renderBoard = (
  training: Parameters<typeof RegionsLeaderboard>[0]['training'],
  url = '/regions'
) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <RegionsLeaderboard rollups={ROLLUPS} training={training} />
      <Where />
    </MemoryRouter>
  )

const table = () => screen.getByRole('table', { name: 'Region rankings' })
const rowOf = (region: string) =>
  within(table())
    .getAllByRole('row')
    .find(tr =>
      within(tr)
        .queryAllByRole('link')
        .some(a => a.getAttribute('href') === `/region/${region}`)
    )!
const regionOrder = () =>
  within(table())
    .getAllByRole('link')
    .map(a => a.getAttribute('href'))
    .filter(h => /^\/region\/\d+$/.test(h ?? ''))

describe('RegionsLeaderboard officer training ≥768 (#2330)', () => {
  it('groups Round 1 and Round 2 training columns at 4+ and All 7', () => {
    renderBoard(OCT)
    const heads = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(heads.some(h => /^Round 1 training/.test(h ?? ''))).toBe(true)
    expect(
      heads.some(h => /^Round 2 training.*opens Nov 1/.test(h ?? ''))
    ).toBe(true)
    expect(heads.filter(h => h === '4+')).toHaveLength(2)
    expect(heads.filter(h => h === 'All 7')).toHaveLength(2)
  })

  it('shows each region’s Round 1 figures linking to its Training page', () => {
    renderBoard(OCT, '/regions?py=2026-2027&date=2026-10-25')
    const row = within(rowOf('02'))
    const link = row.getByRole('link', { name: /Region 02 Round 1: 75%/ })
    expect(link).toHaveTextContent('75%')
    expect(link).toHaveAttribute(
      'href',
      '/region/02/training?py=2026-2027&date=2026-10-25'
    )
    expect(row.getByText('50%')).toBeInTheDocument()
  })

  it('Round 2 before it opens reads "not started", never 0%', () => {
    renderBoard(OCT)
    const row = within(rowOf('01'))
    expect(row.getByText('not started')).toBeInTheDocument()
    expect(row.queryByText('0%')).toBeNull()
    // A round with nothing to compare has no sort button (as on the
    // region Training page).
    expect(
      within(table()).getAllByRole('button', { name: /Sort by 4\+/ })
    ).toHaveLength(1)
  })

  it('a region without figures reads "not available", never 0%', () => {
    renderBoard(OCT)
    const row = within(rowOf('03'))
    expect(row.getAllByText('not available').length).toBeGreaterThan(0)
    expect(row.queryByText('0%')).toBeNull()
  })

  it('sorts by Round 1 4+, highest first, regions without figures last', () => {
    renderBoard(OCT)
    fireEvent.click(
      within(table()).getByRole('button', { name: /Sort by 4\+/ })
    )
    expect(regionOrder()).toEqual(['/region/02', '/region/01', '/region/03'])
    expect(screen.getByTestId('where').textContent).toContain('sort=r1Dcp')
    // Flipped: lowest first, the unmeasured region still last.
    fireEvent.click(
      within(table()).getByRole('button', { name: /Sort by 4\+/ })
    )
    expect(regionOrder()).toEqual(['/region/01', '/region/02', '/region/03'])
  })

  it('without a training prop the table is as before (6 columns)', () => {
    renderBoard(undefined)
    expect(within(table()).getAllByRole('columnheader')).toHaveLength(6)
  })
})

describe('RegionsLeaderboard officer training <768 (#2330)', () => {
  it('offers the training figures as phone columns', () => {
    mobile.value = true
    renderBoard(OCT, '/regions?cols=r1Dcp,r1AllSeven')
    const heads = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(heads).toEqual(['Region', 'R1 4+', 'R1 all 7'])
    expect(
      within(rowOf('02')).getByRole('link', { name: /Region 02 Round 1: 75%/ })
    ).toHaveAttribute('href', '/region/02/training')
  })

  it('a Round 2 column before November says "not started"', () => {
    mobile.value = true
    renderBoard(OCT, '/regions?cols=r2Dcp,score')
    expect(within(rowOf('01')).getByText('not started')).toBeInTheDocument()
  })
})
