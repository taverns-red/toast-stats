/**
 * Worldwide scoreboard axe scan (#1500, epic #1496 Sprint 4).
 *
 * A 5-to-10 column × ~25 row numeric table is only usable with real table
 * semantics: a `<caption>`, `scope="col"` year headers, `scope="row"` metric
 * headers, and `scope="colgroup"` group headers. This scans the loaded table,
 * the artifact-404 placeholder and the loading skeleton — the states a reader
 * can actually land on.
 *
 * Structural half of the pair: axe's `color-contrast` rule is auto-disabled
 * under JSDOM (Lesson 075), so contrast for this surface is owned by
 * `WorldwideScoreboardContrast.test.ts`.
 *
 * Routes to the integration project via `__tests__/accessibility/` (R22).
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import {
  WorldwideScoreboard,
  type WorldwideScoreboardProps,
} from '../../components/WorldwideScoreboard'
import {
  globalHistoryFixture,
  globalTotalsFixture,
} from '../fixtures/globalHistory'

expect.extend(toHaveNoViolations)

afterEach(cleanup)

const loaded: WorldwideScoreboardProps = {
  history: globalHistoryFixture,
  historyLoading: false,
  historyError: false,
  clubsByCountry: globalTotalsFixture.clubsByCountry,
  clubsCounted: globalTotalsFixture.membership.clubsCounted,
  countrySnapshotDate: globalTotalsFixture.date,
  countryLoading: false,
  countryError: false,
}

const renderBoard = (props: Partial<WorldwideScoreboardProps> = {}) =>
  render(
    <MemoryRouter>
      <WorldwideScoreboard {...loaded} {...props} />
    </MemoryRouter>
  )

describe('WorldwideScoreboard — accessibility (#1500)', () => {
  it('has no axe violations in the loaded state', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations while loading', async () => {
    const { container } = renderBoard({
      historyLoading: true,
      history: null,
      countryLoading: true,
      clubsByCountry: null,
      clubsCounted: null,
    })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations when the artifact is not published yet', async () => {
    const { container } = renderBoard({
      history: null,
      clubsByCountry: null,
      clubsCounted: null,
      countrySnapshotDate: null,
    })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('gives the scoreboard a caption and column-scoped year headers', () => {
    renderBoard()
    const table = screen.getByRole('table', { name: /program year/i })
    expect(table.querySelector('caption')).not.toBeNull()
    const yearHeads = screen.getAllByTestId(/^wws-year-head-/)
    expect(yearHeads.length).toBeGreaterThan(0)
    for (const th of yearHeads) {
      expect(th.tagName).toBe('TH')
      expect(th).toHaveAttribute('scope', 'col')
    }
  })

  it('gives every metric a row-scoped header, so a cell is announced with its metric', () => {
    renderBoard()
    for (const row of screen.getAllByTestId(/^wws-row-/)) {
      const header = row.querySelector('th')
      expect(header).not.toBeNull()
      expect(header).toHaveAttribute('scope', 'row')
    }
  })

  it('names both horizontal scroll regions, since each is keyboard-focusable', () => {
    renderBoard()
    // The <section> wrapper is itself a named region (aria-labelledby); the
    // two scroll containers are the focusable ones and each needs its own name.
    const scrollRegions = screen
      .getAllByRole('region')
      .filter(el => el.classList.contains('wws__scroll'))
    expect(scrollRegions).toHaveLength(2)
    for (const region of scrollRegions) {
      expect(region.getAttribute('aria-label')).toBeTruthy()
      expect(region).toHaveAttribute('tabindex', '0')
    }
  })

  it('reads out the reason for every absent cell, not just the short marker', () => {
    renderBoard()
    const absent = document.querySelectorAll('[data-absence]')
    expect(absent.length).toBeGreaterThan(0)
    for (const cell of absent) {
      expect(cell.querySelector('.sr-only')?.textContent || '').toMatch(
        /not (applicable|on file|zero)|no /i
      )
      expect(cell.getAttribute('title')).toBeTruthy()
    }
  })
})
