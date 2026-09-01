/**
 * `/history` — the worldwide scoreboard section (#1500, epic #1496 Sprint 4).
 *
 * Ruled on #1426 (2026-08-19 #1): the worldwide series EXTENDS `/history`;
 * there is no new global page. These tests are the contract for the ruled
 * labels and — above everything else — for the rule that **absent is never
 * zero**. Three different kinds of absence live in this artifact and each
 * must render as its own visible, distinguishable fact:
 *
 *   1. `smedley` before PY 2025-2026 → NOT APPLICABLE (the tier did not exist)
 *   2. `education` for PY 2025-2026  → NOT ON FILE (a live backfill hole)
 *   3. `clubMovement.newClubs`        → FORWARD-ONLY (populates from 2026-27)
 *
 * A rendered `0`, or a blank cell that reads as "none", is a wrong number
 * published under our name.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HistoryPage from '../HistoryPage'
import {
  globalHistoryFixture,
  globalTotalsFixture,
} from '../../__tests__/fixtures/globalHistory'

vi.mock('../../hooks/useProgramYearSummaries', () => ({
  useProgramYearSummaries: () => ({
    summaries: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}))

const globalHistoryState = {
  history: globalHistoryFixture,
  isLoading: false,
  isError: false,
}
const clubsByCountryState = {
  clubsByCountry: globalTotalsFixture.clubsByCountry,
  clubsCounted: globalTotalsFixture.membership.clubsCounted,
  snapshotDate: globalTotalsFixture.date,
  isLoading: false,
  isError: false,
}

vi.mock('../../hooks/useGlobalHistory', () => ({
  useGlobalHistory: () => globalHistoryState,
  useGlobalClubsByCountry: () => clubsByCountryState,
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>
  )

beforeEach(() => {
  globalHistoryState.history = globalHistoryFixture
  globalHistoryState.isLoading = false
  globalHistoryState.isError = false
})

describe('/history — worldwide scoreboard (#1500)', () => {
  it('renders the worldwide section with one column per program year, newest first', () => {
    renderPage()
    const section = screen.getByTestId('worldwide-scoreboard')
    expect(section).toBeInTheDocument()

    const yearHeaders = within(section)
      .getAllByTestId(/^wws-year-head-/)
      .map(el => el.textContent?.trim())
    expect(yearHeaders).toEqual([
      '2025-26',
      '2024-25',
      '2023-24',
      '2022-23',
      '2021-22',
    ])
  })

  it('renders every ruled row', () => {
    renderPage()
    const section = screen.getByTestId('worldwide-scoreboard')
    for (const key of [
      'total-membership',
      'total-membership-march31',
      'membership-payments',
      'paid-clubs',
      'avg-club-size',
      'districts',
      'distinguished-clubs',
      'distinguished-districts',
      'new-clubs-still-active',
      'new-clubs-report-basis',
      'suspended-clubs',
      'education-total',
    ]) {
      expect(within(section).getByTestId(`wws-row-${key}`)).toBeInTheDocument()
    }
  })

  it('states the average-club-size basis on the page, not just in the methodology', () => {
    renderPage()
    const row = screen.getByTestId('wws-row-avg-club-size')
    expect(row.textContent).toMatch(/June[- ]30 membership ÷ paid clubs/i)
  })

  it('labels the district count with undistricted stated separately (ruling #4)', () => {
    renderPage()
    const cell = screen.getByTestId('wws-cell-districts-2025-2026')
    expect(cell.textContent).toMatch(/126/)
    expect(cell.textContent).toMatch(/undistricted/i)
  })

  it('carries the March-31 membership basis alongside June-30, both labelled', () => {
    renderPage()
    expect(screen.getByTestId('wws-row-total-membership').textContent).toMatch(
      /June 30/i
    )
    const march = screen.getByTestId('wws-row-total-membership-march31')
    expect(march.textContent).toMatch(/March 31/i)
    expect(
      screen.getByTestId('wws-cell-total-membership-march31-2025-2026')
        .textContent
    ).toMatch(/264,166/)
  })

  describe('absent is never zero', () => {
    it('renders Smedley for a pre-2025-26 year as not-applicable, never 0', () => {
      renderPage()
      const cell = screen.getByTestId('wws-cell-smedley-2024-2025')
      expect(cell).toHaveAttribute('data-absence', 'not-applicable')
      expect(cell.textContent).not.toMatch(/\b0\b/)
      expect(cell.textContent?.trim()).not.toBe('')
      expect(cell.textContent).toMatch(/not applicable/i)
    })

    it('renders Smedley for 2025-26 as its real number', () => {
      renderPage()
      const cell = screen.getByTestId('wws-cell-smedley-2025-2026')
      expect(cell).not.toHaveAttribute('data-absence')
      expect(cell.textContent).toMatch(/1,912/)
    })

    it('renders the 2025-26 education hole as not-on-file, never 0', () => {
      renderPage()
      const cell = screen.getByTestId('wws-cell-education-total-2025-2026')
      expect(cell).toHaveAttribute('data-absence', 'not-on-file')
      expect(cell.textContent).toMatch(/not on file/i)
      expect(cell.textContent).not.toMatch(/\b0\b/)
    })

    it('renders education for years that have it', () => {
      renderPage()
      const cell = screen.getByTestId('wws-cell-education-total-2024-2025')
      expect(cell).not.toHaveAttribute('data-absence')
      expect(cell.textContent).toMatch(/108,130/)
    })

    it('renders the missing March-31 rollup as not-on-file, never 0', () => {
      renderPage()
      const cell = screen.getByTestId(
        'wws-cell-total-membership-march31-2021-2022'
      )
      expect(cell).toHaveAttribute('data-absence', 'not-on-file')
      expect(cell.textContent).not.toMatch(/\b0\b/)
    })

    it('renders report-basis new clubs as forward-only, distinct from not-on-file', () => {
      renderPage()
      const cell = screen.getByTestId(
        'wws-cell-new-clubs-report-basis-2025-2026'
      )
      expect(cell).toHaveAttribute('data-absence', 'forward-only')
      expect(cell.textContent).toMatch(/2026-27/)
      expect(cell.textContent).not.toMatch(/\b0\b/)
    })

    it('hides the education rows entirely when NO year has education data', () => {
      globalHistoryState.history = {
        ...globalHistoryFixture,
        years: globalHistoryFixture.years.map(y => ({ ...y, education: null })),
      }
      renderPage()
      expect(screen.queryByTestId('wws-row-education-total')).toBeNull()
      expect(screen.getByTestId('worldwide-scoreboard').textContent).toMatch(
        /education awards are not on file/i
      )
    })
  })

  describe('new clubs: two different metrics, two different labels (ruling #5)', () => {
    it('labels our basis "new clubs still active", never plain "new clubs"', () => {
      renderPage()
      const row = screen.getByTestId('wws-row-new-clubs-still-active')
      expect(row.textContent).toMatch(/new clubs still active at year end/i)
    })

    it('labels the TI report basis distinctly and says the two differ', () => {
      renderPage()
      const row = screen.getByTestId('wws-row-new-clubs-report-basis')
      expect(row.textContent).toMatch(/report basis/i)
      expect(row.textContent).not.toMatch(/still active/i)
      // The still-active row carries our basis; both rows exist side by side.
      expect(
        screen.getByTestId('wws-cell-new-clubs-still-active-2025-2026')
          .textContent
      ).toMatch(/913/)
    })
  })

  describe('clubs by country — latest snapshot only', () => {
    it('renders an explicit Unknown row with a count and a share', () => {
      renderPage()
      const unknown = screen.getByTestId('wws-country-row-unknown')
      expect(unknown.textContent).toMatch(/unknown/i)
      expect(unknown.textContent).toMatch(/284/)
      expect(unknown.textContent).toMatch(/%/)
    })

    it('listed countries plus unknown equal the clubs counted', () => {
      renderPage()
      const total = screen.getByTestId('wws-country-total')
      expect(total.textContent).toMatch(/14,359/)
      const listed = screen
        .getAllByTestId(/^wws-country-clubs-/)
        .map(el => Number((el.textContent || '').replace(/[^0-9]/g, '')))
      expect(listed.reduce((a, b) => a + b, 0)).toBe(
        globalTotalsFixture.membership.clubsCounted
      )
    })

    it('states that it is the latest snapshot, not a per-year series', () => {
      renderPage()
      const block = screen.getByTestId('wws-clubs-by-country')
      expect(block.textContent).toMatch(/2026-08-31/)
      expect(block.textContent).toMatch(/latest snapshot/i)
    })
  })

  describe('absence + loading discipline (CLS)', () => {
    it('reserves a height-matched slot while the query is in flight', () => {
      globalHistoryState.isLoading = true
      globalHistoryState.history = null as never
      renderPage()
      const skeleton = screen.getByTestId('worldwide-scoreboard-skeleton')
      expect(skeleton).toBeInTheDocument()
      expect(screen.queryByTestId('wws-row-paid-clubs')).toBeNull()
    })

    it('renders a fixed-height placeholder when the artifact 404s, not a collapse', () => {
      globalHistoryState.isLoading = false
      globalHistoryState.history = null as never
      renderPage()
      const placeholder = screen.getByTestId('worldwide-scoreboard-placeholder')
      expect(placeholder.textContent).toMatch(/not yet published/i)
    })
  })

  it('links to the methodology section that states the bases', () => {
    renderPage()
    const link = screen.getByTestId('wws-methodology-link')
    expect(link).toHaveAttribute('href', '/methodology#worldwide-rollup')
  })
})
