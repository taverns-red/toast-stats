/**
 * The /history year-card skeleton must reserve the height the loaded grid
 * will occupy (#1500, epic #1496 Sprint 4).
 *
 * Found by live-driving the PR preview at 1280 rather than by any unit test:
 * `SKELETON_COUNT` was a hardcoded 3, but the archive now holds TEN completed
 * program years (the epic's own 2016-17 → 2020-21 backfill landed today). The
 * grid therefore grew from one skeleton row to three real rows on load and
 * pushed everything below it down ~800px. Measured against prod, page CLS at
 * 1280 went 0.085 → 0.210 the moment a tall section sat underneath — which is
 * exactly the Lesson 79/107 tripwire, one component upstream of the new one.
 *
 * The fix is the same rule the tripwire states: reserve one skeleton per card
 * you are actually going to render. The count comes from the page as a prop
 * (R3) — a presentational component must not re-derive the program year.
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProgramYearSummaryCards } from '../ProgramYearSummaryCards'

const renderLoading = (expectedCount?: number) =>
  render(
    <MemoryRouter>
      <ProgramYearSummaryCards
        summaries={[]}
        isLoading
        isError={false}
        {...(expectedCount === undefined ? {} : { expectedCount })}
      />
    </MemoryRouter>
  )

describe('ProgramYearSummaryCards — height-matched skeleton (#1500)', () => {
  it('reserves one skeleton per program year the page expects to render', () => {
    renderLoading(10)
    expect(screen.getAllByTestId('history-year-card-skeleton')).toHaveLength(10)
  })

  it('tracks the count as the archive grows, rather than a fixed 3', () => {
    renderLoading(7)
    expect(screen.getAllByTestId('history-year-card-skeleton')).toHaveLength(7)
  })

  it('still reserves something when the page has no expectation to give', () => {
    renderLoading()
    expect(
      screen.getAllByTestId('history-year-card-skeleton').length
    ).toBeGreaterThan(0)
  })

  it('never reserves a negative or zero number of cards', () => {
    renderLoading(0)
    expect(
      screen.getAllByTestId('history-year-card-skeleton').length
    ).toBeGreaterThan(0)
  })
})
