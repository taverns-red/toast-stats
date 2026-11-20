/* /history agrees with itself (#2657, REF-23, REF-24).

   The callout's "years before X aren't on file" must name the earliest year
   the cards actually show, not a hardcoded 2019. The year chips are links to
   their cards (the live chip to the landing page), and no non-link carries
   aria-current. */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HistoryPage from '../HistoryPage'
import type { ProgramYearSummary } from '../../utils/programYearSummary'

const summary = (startYear: number): ProgramYearSummary =>
  ({
    startYear,
    label: `${startYear}-${String(startYear + 1).slice(-2)}`,
    yearEndDate: `${startYear + 1}-06-30`,
    totalDistricts: 120,
    totalPaidClubs: 14000,
    totalPayments: 300000,
    totalDistinguishedClubs: 6000,
    topDistricts: [],
  }) as unknown as ProgramYearSummary

// Newest first, as the hook returns them; the oldest card is 2016-17.
const SUMMARIES = [summary(2018), summary(2017), summary(2016)]

vi.mock('../../hooks/useProgramYearSummaries', () => ({
  useProgramYearSummaries: () => ({
    summaries: SUMMARIES,
    isLoading: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('../../hooks/useGlobalHistory', () => ({
  useGlobalHistory: () => ({ history: null, isLoading: false, isError: false }),
  useGlobalClubsByCountry: () => ({
    clubsByCountry: null,
    clubsCounted: null,
    snapshotDate: null,
    isLoading: false,
    isError: false,
  }),
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>
  )

describe('HistoryPage — callout and cards agree (#2657 REF-23)', () => {
  it('the callout names the earliest year with a card, not 2019', () => {
    renderPage()
    const callout = screen.getByTestId('history-archive-callout')
    expect(callout).toHaveTextContent(/before 2016/)
    expect(callout).not.toHaveTextContent(/2019/)
  })
})

describe('HistoryPage — year chips are links (#2657 REF-24)', () => {
  it('each archived year chip links to its card', () => {
    renderPage()
    const strip = screen.getByTestId('history-year-strip')
    for (const s of SUMMARIES) {
      const chip = within(strip).getByRole('link', { name: s.label })
      expect(chip).toHaveAttribute('href', `#py-${s.startYear}`)
      expect(document.getElementById(`py-${s.startYear}`)).not.toBeNull()
    }
  })

  it('the live chip links to the landing page', () => {
    renderPage()
    const strip = screen.getByTestId('history-year-strip')
    expect(within(strip).getByRole('link', { name: /live/i })).toHaveAttribute(
      'href',
      '/'
    )
  })

  it('nothing in the strip that is not a link carries aria-current', () => {
    renderPage()
    const strip = screen.getByTestId('history-year-strip')
    for (const el of strip.querySelectorAll('[aria-current]')) {
      expect(el.tagName).toBe('A')
    }
  })
})
