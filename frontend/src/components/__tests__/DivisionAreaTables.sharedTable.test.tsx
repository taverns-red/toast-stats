/**
 * Division and area tables on the shared table styles (#2718, M5 of #2676;
 * spec section 14 row M5; #2655 UNIT-16, UNIT-28, REF-09, UNIT-33; #2707).
 *
 * One file for the component-level contract of the four tables M5 covers:
 * area performance, the two criteria tables, the division/area club table and
 * the print-pack tables. DOM assertions read real elements; CSS assertions
 * read the stylesheet as text (jsdom has no layout engine, R22 forbids page
 * mounts in unit tests).
 */

import React from 'react'
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AreaPerformanceTable } from '../AreaPerformanceTable'
import { CriteriaExplanation } from '../CriteriaExplanation'
import { DivisionCriteriaExplanation } from '../DivisionCriteriaExplanation'
import { ClubHealthTable } from '../ClubHealthTable'
import { CouncilPackDocument } from '../councilPack/CouncilPackDocument'
import { divisionChip } from '../DivisionRecognitionChip'
import type { AreaPerformance } from '../../utils/divisionStatus'
import { withRecognitionState } from '../../test-utils/areaFixture'
import { renderRecognitionBadge } from '../../utils/areaRecognitionBadge'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import type { CouncilPack } from '../../utils/councilPack'
import { getProgramYear } from '../../utils/programYear'

const read = (rel: string): string =>
  readFileSync(join(__dirname, '..', '..', rel), 'utf-8')

const px = (n: string, unit: string): number =>
  unit === 'rem' ? Number(n) * 16 : Number(n)

const area = (over: Partial<AreaPerformance> = {}): AreaPerformance =>
  withRecognitionState(
    {
      areaId: 'A1',
      status: 'not-qualified',
      clubBase: 8,
      paidClubs: 7,
      netGrowth: -1,
      distinguishedClubs: 3,
      requiredDistinguishedClubs: 4,
      firstRoundVisits: {
        completed: 8,
        required: 8,
        percentage: 100,
        meetsThreshold: true,
      },
      secondRoundVisits: {
        completed: 5,
        required: 8,
        percentage: 62.5,
        meetsThreshold: false,
      },
      isQualified: false,
      ...over,
    },
    '2026-06-15'
  )

const club = (over: Partial<ClubTrend>): ClubTrend => ({
  clubId: 'c1',
  clubName: 'Limestone City Club',
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: '01',
  areaName: 'Area 01',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'intervention-required',
  riskFactors: [],
  membershipTrend: [{ date: '2025-07-15', count: 18 }],
  dcpGoalsTrend: [{ date: '2025-07-15', goalsAchieved: 3 }],
  ...over,
})

/** A scroller that keyboard users can reach and that has a name. */
const expectLabelledScroller = (table: HTMLElement): void => {
  const region = table.closest('[role="region"]')
  expect(region).not.toBeNull()
  expect(region).toHaveAttribute('tabindex', '0')
  expect(region?.getAttribute('aria-label') ?? '').not.toBe('')
}

describe('AreaPerformanceTable on the shared table styles (#2718)', () => {
  afterEach(() => cleanup())

  const renderFull = () =>
    render(
      <MemoryRouter>
        <AreaPerformanceTable
          areas={[area(), area({ areaId: 'A2' })]}
          label="Division A area performance"
        />
      </MemoryRouter>
    )

  it('is a .dt table with a caption', () => {
    renderFull()
    const table = screen.getByRole('table')
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')).not.toBeNull()
  })

  it('builds its caption from the label, so cards on one page differ', () => {
    render(
      <MemoryRouter>
        <AreaPerformanceTable
          areas={[area()]}
          label="Division B area performance"
        />
      </MemoryRouter>
    )
    const caption = screen.getByRole('table').querySelector('caption')
    expect(caption).toHaveTextContent('Division B area performance')
  })

  it('names each area with th scope=row', () => {
    renderFull()
    const heads = screen.getAllByRole('rowheader')
    expect(heads.map(h => h.textContent)).toEqual(['A1', 'A2'])
    for (const h of heads) expect(h).toHaveAttribute('scope', 'row')
  })

  it('keeps its scroller labelled and focusable', () => {
    renderFull()
    expectLabelledScroller(screen.getByRole('table'))
  })

  it('has no sub-14px header text (UNIT-16: 11px sub-lines)', () => {
    renderFull()
    const table = screen.getByRole('table')
    expect(table.innerHTML).not.toMatch(/font-size:\s*1[0-3]px/)
    expect(table.innerHTML).not.toMatch(/\btext-xs\b/)
  })

  it('shows visit met/unmet as a marker plus text, never a glyph or colour alone', () => {
    renderFull()
    const table = screen.getByRole('table')
    expect(table.textContent).not.toMatch(/[✓✗]/)
    const met = table.querySelectorAll('.dt-criterion--met')
    const unmet = table.querySelectorAll('.dt-criterion--not-met')
    expect(met.length).toBeGreaterThan(0)
    expect(unmet.length).toBeGreaterThan(0)
    for (const el of met) {
      expect(el.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
      expect(el.textContent).toMatch(/\bMet\b/)
    }
    for (const el of unmet) {
      expect(el.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
      expect(el.textContent).toMatch(/\bNot met\b/)
    }
    expect(table.innerHTML).not.toMatch(/text-tm-(loyal-blue|true-maroon)/)
  })

  it('switches to the "Columns to compare" layout below 1024, not 768 (UNIT-16)', () => {
    const src = read('components/PriorityColumnsTable.tsx')
    expect(src).toMatch(/breakpoint\??:\s*number/)
    const table = read('components/AreaPerformanceTable.tsx')
    expect(table).toMatch(/breakpoint=\{1024\}/)
  })
})

describe('criteria tables on the shared table styles (#2718)', () => {
  afterEach(() => cleanup())

  it.each([
    ['CriteriaExplanation', <CriteriaExplanation key="a" defaultExpanded />],
    [
      'DivisionCriteriaExplanation',
      <DivisionCriteriaExplanation key="d" defaultExpanded />,
    ],
  ])('%s: .dt, caption, th scope=row, labelled scroller (HUB-36)', (_n, ui) => {
    render(ui)
    const table = screen.getByRole('table')
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')).not.toBeNull()
    const heads = within(table).getAllByRole('rowheader')
    expect(heads).toHaveLength(3)
    for (const h of heads) expect(h).toHaveAttribute('scope', 'row')
    expectLabelledScroller(table)
  })
})

describe('ClubHealthTable, the division and area club table (#2718)', () => {
  afterEach(() => cleanup())

  const clubs: ClubTrend[] = [
    club({}),
    club({
      clubId: 'c2',
      clubName: 'Select Club',
      currentStatus: 'thriving',
      distinguishedLevel: 'Select',
    }),
  ]
  const renderTable = () =>
    render(
      <MemoryRouter>
        <ClubHealthTable
          clubs={clubs}
          districtId="61"
          label="Clubs in Area 01"
        />
      </MemoryRouter>
    )

  it('is a .dt table with a caption and club names as row headers', () => {
    renderTable()
    const table = screen.getByRole('table')
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')).toHaveTextContent('Clubs in Area 01')
    const heads = screen.getAllByRole('rowheader')
    expect(heads.map(h => h.textContent)).toEqual([
      'Limestone City Club',
      'Select Club',
    ])
    for (const h of heads) expect(h).toHaveAttribute('scope', 'row')
  })

  it('labels its scroller', () => {
    renderTable()
    expectLabelledScroller(screen.getByRole('table'))
    expect(screen.getByRole('region').getAttribute('aria-label')).toContain(
      'Clubs in Area 01'
    )
  })

  it('has no whole-row click: the name link is the only target', () => {
    renderTable()
    const rows = screen.getByRole('table').querySelectorAll('tbody tr')
    for (const row of rows) {
      expect(row).not.toHaveClass('cursor-pointer')
      expect(row.getAttribute('onclick')).toBeNull()
    }
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('right-aligns the Members figures as a numeric column', () => {
    renderTable()
    const cells = screen
      .getByRole('table')
      .querySelectorAll('tbody tr:first-child td.dt-num')
    expect(cells).toHaveLength(1)
    expect(cells[0]).toHaveTextContent('18')
  })

  it('uses no sub-14px or CSS-hidden column text', () => {
    renderTable()
    const html = screen.getByRole('table').innerHTML
    expect(html).not.toMatch(/\btext-xs\b/)
    // A hiding utility class (hidden, md:hidden, max-md:hidden), not aria-hidden.
    expect(html).not.toMatch(/class="(?:[^"]*[\s:])?hidden\b/)
  })
})

describe('entity-tables stylesheet (#2718)', () => {
  const css = read('styles/components/entity-tables.css')

  it('exists and is imported by index.css', () => {
    expect(css.length).toBeGreaterThan(0)
    expect(read('index.css')).toMatch(/entity-tables\.css/)
  })

  it('has no CSS-hidden columns', () => {
    expect(css).not.toMatch(/display:\s*none/)
  })

  it('keeps every font size at or above the 14px floor', () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)]
    const tooSmall = sizes.filter(([, n, unit]) => px(n!, unit!) < 14)
    expect(tooSmall.map(m => m[0])).toEqual([])
  })

  it('keeps area-table cells on one line so the recognition badge stays a pill', () => {
    expect(css).toMatch(
      /\.entity-table--areas td\s*\{[^}]*white-space:\s*nowrap/
    )
  })

  it('gives name links a 44px hit area', () => {
    expect(css).toMatch(
      /\.entity-table__link\s*\{[^}]*min-height:\s*44px[^}]*\}/
    )
  })

  it('uses one 16px phone gutter on division and area pages (UNIT-28)', () => {
    expect(css).toMatch(
      /@media \(max-width: 639px\)\s*\{[^@]*\.entity-page\s*\{[^}]*padding-left:\s*16px[^}]*padding-right:\s*16px[^}]*--context-bar-bleed:\s*16px/
    )
  })

  it('the area card body does not stack a second 24px inset on phones (UNIT-28)', () => {
    const card = read('components/DivisionPerformanceCard.tsx')
    expect(card).not.toMatch(/className="p-6"/)
  })
})

describe('print pack roster on screen (#2718, REF-09 / UNIT-33)', () => {
  afterEach(() => cleanup())

  const pack: CouncilPack = {
    divisionId: 'B',
    areaId: null,
    recognition: {
      label: 'Net Loss',
      paidClubs: 5,
      clubBase: 6,
      distinguishedClubs: 2,
      requiredDistinguishedClubs: 3,
      gapToDistinguished: 'N/A',
      gapToSelect: 'N/A',
      gapToPresidents: 'N/A',
    },
    areas: [
      {
        areaId: 'B1',
        recognition: 'Net Loss',
        paidClubs: 5,
        clubBase: 6,
        distinguishedClubs: 2,
        requiredDistinguishedClubs: 3,
        visits: {
          completed: 1,
          required: 3,
          percentage: 33,
          meetsThreshold: false,
        },
        missingVisit: [],
        cspTracked: true,
        cspSubmitted: 1,
        cspHeld: 2,
      },
    ],
    visitRound: 1,
    visitDeadline: '2026-11-30',
    closeToDistinguished: { shown: [], total: 0, more: 0 },
    csp: {
      tracked: true,
      submitted: 1,
      held: 2,
      missing: { shown: [], total: 0, more: 0 },
    },
    roster: [
      {
        clubId: 'c1',
        clubName: 'Limestone City Club',
        areaId: 'B1',
        health: 'Intervention required',
        members: 12,
        goals: 3,
        distinguished: '—',
        visit: 'missing',
        csp: 'missing',
      },
    ],
  }

  const renderPack = () =>
    render(
      <MemoryRouter>
        <CouncilPackDocument
          kind="division"
          districtId="61"
          title="Division B"
          pack={pack}
          programYear={getProgramYear(2025)}
          snapshotDate="2026-03-15"
          asOfDate="2026-03-15"
          sourcePath="/district/61/division/B"
          backTo="/district/61/division/B"
          printedAt={new Date(2026, 2, 16)}
        />
      </MemoryRouter>
    )

  it('puts every pack table in a labelled, focusable scroll region', () => {
    const { container } = renderPack()
    const tables = container.querySelectorAll('table')
    expect(tables.length).toBe(2)
    for (const t of tables) expectLabelledScroller(t as HTMLElement)
  })

  it('does not let a section scroll without a name', () => {
    const css = read('styles/components/council-pack.css')
    expect(css).not.toMatch(
      /\.council-pack__section\s*\{[^}]*overflow-x:\s*auto/
    )
  })

  it('is wide enough for the roster at 1280 (870px table plus page padding)', () => {
    const css = read('styles/components/council-pack.css')
    const m = /\.council-pack\s*\{[^}]*max-width:\s*([\d.]+)rem/.exec(css)
    expect(Number(m?.[1]) * 16).toBeGreaterThanOrEqual(870 + 2 * 20 + 2)
  })

  it('agrees on the casing of "Net Loss" between area and division labels', () => {
    const areaLabel = renderRecognitionBadge({
      status: 'not-distinguished',
      level: 'none',
      failureReason: 'net-loss',
    } as never).label
    const divisionLabel = divisionChip({
      divisionId: 'B',
      status: 'not-distinguished',
      clubBase: 6,
      paidClubs: 5,
      netGrowth: -1,
      distinguishedClubs: 2,
      requiredDistinguishedClubs: 3,
      areas: [],
    } as never).label
    expect(divisionLabel).toBe(areaLabel)
  })
})
