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
  it('Round 1 has 4+ and All 7; Round 2 before it opens is ONE column', () => {
    renderBoard(OCT)
    const heads = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(heads.some(h => /^Round 1 training/.test(h ?? ''))).toBe(true)
    expect(
      heads.some(h => /^Round 2 training.*opens Nov 1/.test(h ?? ''))
    ).toBe(true)
    // Review of #2334: two "not started" columns overflowed the table at
    // 1024. Until it opens, Round 2 is one narrow column.
    expect(heads.filter(h => h === '4+')).toHaveLength(1)
    expect(heads.filter(h => h === 'All 7')).toHaveLength(1)
    const r2 = within(table()).getByRole('columnheader', {
      name: /^Round 2 training/,
    })
    expect(r2).not.toHaveAttribute('colspan', '2')
    const cells = within(rowOf('01')).getAllByRole('cell')
    expect(cells.filter(td => td.textContent === 'not started')).toHaveLength(1)
    expect(
      cells.find(td => td.textContent === 'not started')
    ).not.toHaveAttribute('colspan')
  })

  it('once Round 2 opens it expands to 4+ and All 7', () => {
    renderBoard(regionsTrainingOverview(FILE, '2026-11-20', '2026-2027'))
    const heads = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(heads.filter(h => h === '4+')).toHaveLength(2)
    expect(heads.filter(h => h === 'All 7')).toHaveLength(2)
  })

  it('a date with no figures at all: one "not available" column per round', () => {
    renderBoard(regionsTrainingOverview(null, '2026-10-01', '2026-2027'))
    const heads = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(heads.filter(h => h === '4+')).toHaveLength(0)
    expect(within(rowOf('01')).getAllByText('not available')).toHaveLength(2)
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
  /* ONE training chip, for the round the date ranks on (the open round,
     else the latest started — the region Training page's rankingRound),
     4+ over all seven in the cell (as Dist. clubs stacks count over %).
     Two or four chips pushed the table past the 375 first-content budget
     (mobile-375-gate); the sheet's full table keeps both rounds. The label
     is "Training" (round in its title and the cell's accessible name):
     "R1 training" ellipsized at 375 with CI's Linux fonts (priority-columns
     smoke). */
  it('offers the current round as one column: 4+ over all seven', () => {
    mobile.value = true
    renderBoard(OCT, '/regions?cols=training,score')
    const heads = within(table())
      .getAllByRole('columnheader')
      .map(th => th.textContent?.trim())
    expect(heads).toEqual(['Region', 'Training', 'Score'])
    expect(
      within(table()).getByRole('columnheader', { name: /Training/ })
    ).toBeInTheDocument()
    const link = within(rowOf('02')).getByRole('link', {
      name: /Region 02 Round 1: 75% of clubs with 4\+ officers .*50% with all seven/,
    })
    expect(link).toHaveAttribute('href', '/region/02/training')
    expect(link).toHaveTextContent('75%')
    expect(link).toHaveTextContent('50% all 7')
  })

  it('sorts the column by 4+', () => {
    mobile.value = true
    renderBoard(OCT, '/regions?cols=training,score')
    fireEvent.click(
      within(table()).getByRole('button', { name: /Sort by Training/ })
    )
    expect(screen.getByTestId('where').textContent).toContain('sort=r1Dcp')
    expect(regionOrder()).toEqual(['/region/02', '/region/01', '/region/03'])
  })

  it('once Round 2 opens the column follows it', () => {
    mobile.value = true
    renderBoard(
      regionsTrainingOverview(FILE, '2026-11-20', '2026-2027'),
      '/regions?cols=training,score'
    )
    expect(
      within(rowOf('02')).getByRole('link', { name: /^Region 02 Round 2:/ })
    ).toBeInTheDocument()
  })
})
