/**
 * Education tables on the shared table foundation (#2732, M4 of #2676; spec
 * section 14 row M4, inventory #14, #15, #16).
 *
 * The migration's red test, per table: shared `.dt` chrome, a caption, `th
 * scope` on every header, no column hidden by CSS, nothing under the 14px
 * floor, and a labelled sideways scroller. The district, region and world
 * rollups are sort tables on `DataTable`; the matrix and the leaderboard take
 * the shared styles. Rendered directly (never via a page, R22); CSS and source
 * are read as text because jsdom has no layout engine.
 */
import React from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EducationRollupProgramYearSchema,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import recordedD61 from '../../__tests__/fixtures/d61-education-reports.recorded.json'
import recordedClubs from '../../__tests__/fixtures/d61-education-clubs.recorded.json'
import current from '../../__tests__/fixtures/education-rollup-2026-2027.recorded.json'
import {
  buildDistrictEducation,
  type EducationClub,
} from '../../utils/districtEducation'
import { buildRegionEducation } from '../../utils/regionEducation'
import { buildWorldEducation } from '../../utils/worldEducation'
import { DistrictEducationView } from '../DistrictEducationView'
import { RegionEducationView } from '../RegionEducationView'
import { WorldEducationView } from '../WorldEducationView'
import { EducationAwardsLeaderboard } from '../EducationAwardsLeaderboard'
import type { EducationAwardEntry } from '../../utils/educationAwardRankings'

vi.mock('../../hooks/useEducationTimeline', () => ({
  useEducationTimeline: () => ({
    timeline: null,
    isLoading: false,
    listed: true,
  }),
}))

const read = (rel: string): string =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf-8')

const d61 = recordedD61 as unknown as DistrictReportsDataset
const clubs = (recordedClubs as { clubs: EducationClub[] }).clubs
const rollup = EducationRollupProgramYearSchema.parse(current)

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
}

beforeEach(() => stubMatchMedia(false))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const HIDING =
  /(^|\s)(hidden|(sm|md|lg|xl):table-cell|(sm|md|lg|xl):hidden)(\s|$)|__col--/
const SUB_14 = /(^|\s)text-xs(\s|$)|text-\[(9|10|11|12|13)px\]/

/** The contract every migrated education table meets. */
function expectSharedTable(table: HTMLElement): void {
  expect(table, 'shared .dt chrome').toHaveClass('dt')
  const caption = table.querySelector('caption')
  expect(caption, 'caption').not.toBeNull()
  expect(caption!.textContent!.trim().length, 'caption text').toBeGreaterThan(0)
  const headers = [...table.querySelectorAll('thead th')]
  expect(headers.length).toBeGreaterThan(0)
  for (const th of headers) expect(th).toHaveAttribute('scope', 'col')
  for (const th of table.querySelectorAll('tbody th'))
    expect(th).toHaveAttribute('scope', 'row')
  for (const el of table.querySelectorAll('[class]')) {
    const cls = el.getAttribute('class')!
    expect(cls, `CSS-hidden column: ${cls}`).not.toMatch(HIDING)
    expect(cls, `sub-14px text: ${cls}`).not.toMatch(SUB_14)
  }
}

/** A sideways scroller that is a focusable, named region (WCAG 2.1.1). */
function expectLabelledScroller(table: HTMLElement): void {
  const region = table.closest('[role="region"]')
  expect(region, 'labelled scroll region').not.toBeNull()
  expect(region).toHaveAttribute('tabindex', '0')
  expect(region!.getAttribute('aria-label')).toMatch(/scrolls sideways/)
}

describe('district education: division and area rollup (#14)', () => {
  const renderDistrict = () => {
    const education = buildDistrictEducation({
      reports: d61,
      programYear: '2026-2027',
      clubs,
    })
    return render(
      <MemoryRouter initialEntries={['/district/61/education']}>
        <DistrictEducationView
          education={education}
          snapshotDate="2026-10-13"
          isPriorProgramYear={false}
          programYear="2026-2027"
          districtId="61"
        />
      </MemoryRouter>
    )
  }

  it('meets the shared table contract and sorts through the DataTable header', () => {
    renderDistrict()
    const table = screen.getByRole('table', { name: /education by division/i })
    expectSharedTable(table)
    expect(within(table).getByRole('button', { name: 'Awards' })).toHaveClass(
      'dt-sort-btn'
    )
  })

  it('names each division in a row header', () => {
    renderDistrict()
    const table = screen.getByRole('table', { name: /education by division/i })
    expect(within(table).getAllByRole('rowheader')[0]!.textContent).toMatch(
      /^Division /
    )
  })
})

describe('region education: districts (#15)', () => {
  it('meets the shared table contract, with an unavailable district in words', () => {
    const education = buildRegionEducation({ rollup, region: '01' })
    if (education.status !== 'available') throw new Error('fixture')
    render(
      <MemoryRouter>
        <RegionEducationView
          education={education}
          region="01"
          programYear="2026-2027"
          trend={[]}
        />
      </MemoryRouter>
    )
    const table = screen.getByRole('table', {
      name: /Region 01 districts, education awards/,
    })
    expectSharedTable(table)
    expect(within(table).getByRole('button', { name: 'Awards' })).toHaveClass(
      'dt-sort-btn'
    )
  })
})

describe('world education: regions (#15)', () => {
  it('meets the shared table contract', () => {
    const education = buildWorldEducation({ rollup })
    if (education.status !== 'available') throw new Error('fixture')
    render(
      <MemoryRouter>
        <WorldEducationView
          education={education}
          programYear="2026-2027"
          trend={[]}
        />
      </MemoryRouter>
    )
    const table = screen.getByRole('table', {
      name: 'Regions, education awards',
    })
    expectSharedTable(table)
    expect(within(table).getByRole('button', { name: 'Awards' })).toHaveClass(
      'dt-sort-btn'
    )
  })
})

describe('level by path matrix (#16)', () => {
  it('takes the shared chrome in a labelled scroller', () => {
    const education = buildDistrictEducation({
      reports: d61,
      programYear: '2026-2027',
      clubs,
    })
    render(
      <MemoryRouter>
        <DistrictEducationView
          education={education}
          snapshotDate="2026-10-13"
          isPriorProgramYear={false}
          programYear="2026-2027"
          districtId="61"
        />
      </MemoryRouter>
    )
    const table = screen.getByRole('table', { name: /level × path/i })
    expectSharedTable(table)
    expectLabelledScroller(table)
  })
})

describe('education awards leaderboard (#16)', () => {
  const entry = (n: number): EducationAwardEntry => ({
    clubId: `${1000 + n}`,
    clubName: `Club ${n}`,
    divisionId: 'B',
    areaId: '12',
    membershipBase: 20,
    numerator: 24 - n,
    denominator: 20,
    ratio: (24 - n) / 20,
    rank: n,
  })
  const ranking = {
    available: true,
    sourceReportType: 'education-achievements',
    asOf: 'October 01, 2026',
    ranked: [entry(1), entry(2)],
    ineligible: [],
  }

  it('meets the shared contract and shows the count column at every width', () => {
    render(
      <MemoryRouter>
        <EducationAwardsLeaderboard
          rankings={{ awardsPerBase: ranking, membersWithAward: ranking }}
          districtId="61"
          isPriorProgramYear={false}
        />
      </MemoryRouter>
    )
    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    for (const table of tables) {
      expectSharedTable(table)
      expectLabelledScroller(table)
      // Rank, Club, count and Rate are all real columns.
      expect(within(table).getAllByRole('columnheader')).toHaveLength(4)
    }
  })
})

describe('leaderboard cards in the page grid (#2732)', () => {
  it('can shrink below the table min-width, so the table scrolls inside the card', () => {
    // A grid item defaults to min-width:auto and would grow to the 26rem table,
    // widening the whole page at 375px; min-w-0 lets the card shrink and the
    // labelled scroller take the overflow.
    const board = {
      available: true,
      sourceReportType: 'education-achievements',
      asOf: 'October 01, 2026',
      ranked: [],
      ineligible: [],
    }
    render(
      <MemoryRouter>
        <EducationAwardsLeaderboard
          rankings={{ awardsPerBase: board, membersWithAward: board }}
          districtId="61"
          isPriorProgramYear={false}
        />
      </MemoryRouter>
    )
    for (const card of screen.getAllByTestId('education-awards-leaderboard'))
      expect(card).toHaveClass('min-w-0')
  })
})

describe('education stylesheet floor (#2732)', () => {
  const css = read('styles/components/education.css')
  const rule = (selector: string): string => {
    const at = css.indexOf(`${selector} {`)
    if (at < 0) return ''
    return css.slice(at, css.indexOf('}', at))
  }

  it('the legacy rollup header is no longer 13px', () => {
    expect(rule('.education-rollup__th')).not.toMatch(/0\.8125rem|13px/)
  })

  it('no hand-rolled <table> is left in the three rollup views', () => {
    for (const f of [
      'components/DistrictEducationView.tsx',
      'components/RegionEducationView.tsx',
      'components/WorldEducationView.tsx',
    ]) {
      const text = read(f)
      expect(text, f).not.toMatch(/<table\b/)
      expect(text, f).toMatch(/<DataTable\b|<EducationRollupTable\b/)
    }
  })
})
