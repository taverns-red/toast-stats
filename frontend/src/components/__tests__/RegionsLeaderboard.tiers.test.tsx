/**
 * Which leaderboard columns each width tier renders (#2716).
 *
 * The leaderboard has no Columns menu, so a column that does not fit is not
 * rendered at that tier. regionsLeaderboardLayout.test.ts checks the sums;
 * this checks the component renders the columns those sums assume.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import { RegionsLeaderboard } from '../RegionsLeaderboard'
import type { RegionRollup } from '../../utils/aggregateRegions'
import { regionsTrainingOverview } from '../../utils/regionTraining'
import { stubViewportWidth } from '../../test-utils/viewportMatchMedia'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
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

const ROLLUPS = [mkRollup('01'), mkRollup('02')]
const TRENDS = new Map<string, number[] | null>([
  ['01', [12000, 12500]],
  ['02', [13000, 13278]],
])

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

/* Round 1 has figures (4+ and All 7 columns); Round 2 has not opened (one
   column). */
const TRAINING = regionsTrainingOverview(
  {
    world: {
      officerTraining: { round1: dist(2, 5, 3), round2: dist(10, 0, 0) },
    },
    regions: {
      '01': {
        officerTraining: { round1: dist(2, 1, 1), round2: dist(4, 0, 0) },
      },
      '02': {
        officerTraining: { round1: dist(1, 1, 2), round2: dist(4, 0, 0) },
      },
    },
  } as unknown as RegionRollups,
  '2026-10-25',
  '2026-2027'
)

const renderAt = (
  width: number,
  withTraining = true,
  url = '/regions',
  rollups = ROLLUPS,
  provisional?: ReadonlyMap<string, number>
) => {
  stubViewportWidth(width)
  render(
    <MemoryRouter initialEntries={[url]}>
      <RegionsLeaderboard
        rollups={rollups}
        trends={TRENDS}
        training={withTraining ? TRAINING : undefined}
        provisionalByRegion={provisional}
      />
    </MemoryRouter>
  )
}

const headersIn = (table: HTMLElement) =>
  within(table)
    .getAllByRole('columnheader')
    .map(th => th.textContent?.trim() ?? '')

const pageHeaders = () =>
  headersIn(screen.getByRole('table', { name: 'Region rankings' }))

describe('RegionsLeaderboard columns per width tier (#2716)', () => {
  it('laptop with training: no Trend column', () => {
    renderAt(1024)
    const heads = pageHeaders()
    expect(heads).not.toContain('Trend')
    expect(heads).toContain('Districts')
    expect(heads).toContain('Round 1 (Jun–Aug): All 7 officers trained')
  })

  it('desktop with training: Trend shows', () => {
    renderAt(1280)
    expect(pageHeaders()).toContain('Trend')
  })

  // Score ranks paid clubs, payments and Distinguished (product spec), so all
  // three stay at every tier.
  it('tablet with training: drops Districts and the All 7 columns', () => {
    renderAt(800)
    expect(pageHeaders()).toEqual([
      'Region',
      'Paid clubs',
      'Payments',
      'Distinguished',
      'Score',
      'Round 1 (Jun–Aug): 4+ officers trained',
      expect.stringMatching(/^Round 2 training/),
    ])
  })

  // The one-column round is 88px at this tier, so its header wraps; the
  // date must not split across lines ("opens Nov" over "1").
  it('tablet: the round-not-open header keeps its date on one line', () => {
    renderAt(800)
    expect(pageHeaders()).toContain('Round 2 training, opens Nov 1')
  })

  it('tablet without training: every column, Trend included', () => {
    renderAt(800, false)
    expect(pageHeaders()).toEqual([
      'Region',
      'Trend',
      'Districts',
      'Paid clubs',
      'Payments',
      'Distinguished',
      'Score',
    ])
  })

  it('phone: the full-screen sheet keeps every training column', () => {
    renderAt(375)
    fireEvent.click(screen.getByRole('button', { name: /full table/i }))
    const dialog = screen.getByRole('dialog', { name: /Regions/ })
    const heads = headersIn(within(dialog).getByRole('table'))
    expect(heads).toContain('Districts')
    expect(heads).toContain('Payments')
    expect(heads).toContain('Round 1 (Jun–Aug): All 7 officers trained')
  })

  /* "+N qualifying today" is wider than the Distinguished column at every
     tier, so it goes on its own line under "count · %", where the stylesheet
     lets it wrap (#3264). jsdom does no layout; the region smoke measures. */
  it.each([800, 1024, 1280])(
    '%ipx: "+N qualifying today" sits on its own line under count and share',
    width => {
      renderAt(width, true, '/regions', ROLLUPS, new Map([['01', 12]]))
      const table = screen.getByRole('table', { name: 'Region rankings' })
      const extra = within(table).getByTestId('distinguished-provisional')
      expect(
        extra.closest('.regions-leaderboard__distinguished')
      ).not.toBeNull()
      expect(extra.closest('td')?.textContent).toMatch(
        /^200\s*· 40%\s*\+12 qualifying today/
      )
    }
  )

  /* A shared link can sort by a column this width hides. The rows must not
     follow a column nobody can see, so the table uses its default order. */
  describe('a sort on a column hidden at this width', () => {
    const SORTABLE = [
      { ...mkRollup('01'), districtCount: 3, totalPayments: 9000 },
      { ...mkRollup('02'), districtCount: 9, totalPayments: 15000 },
    ]
    const regionOrder = () =>
      within(screen.getByRole('table', { name: 'Region rankings' }))
        .getAllByRole('link')
        .map(a => a.getAttribute('href'))
        .filter(h => /^\/region\/\d+$/.test(h ?? ''))

    it.each(['districts', 'r1AllSeven'])(
      'tablet, ?sort=%s: region order, Region marked ascending',
      field => {
        renderAt(800, true, `/regions?sort=${field}&dir=desc`, SORTABLE)
        expect(regionOrder()).toEqual(['/region/01', '/region/02'])
        expect(
          screen.getByRole('columnheader', { name: /^Region/ })
        ).toHaveAttribute('aria-sort', 'ascending')
      }
    )

    it('a visible column still sorts: tablet, ?sort=payments', () => {
      renderAt(800, true, '/regions?sort=payments&dir=desc', SORTABLE)
      expect(regionOrder()).toEqual(['/region/02', '/region/01'])
    })
  })
})
