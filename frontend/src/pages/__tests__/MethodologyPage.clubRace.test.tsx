/* /methodology — the "Worldwide club race" section (#1556, phase 4).
 *
 * Ruling R-B (2026-09-12): Toast Stats calls a club Distinguished when it
 * meets the requirements, which may precede TI's official April 30 stamp;
 * the basis statement has to be ON the page, and the /clubs pages link to
 * this anchor. Asserted literally, like the worldwide-rollup section. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

const renderPage = () =>
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  )

const sectionText = (): string =>
  screen.getByTestId('methodology-club-race').textContent || ''

describe('MethodologyPage — Worldwide club race (#1556)', () => {
  it('has a section reachable by the anchor the /clubs pages link to', () => {
    renderPage()
    expect(screen.getByTestId('methodology-club-race')).toBeInTheDocument()
    expect(document.getElementById('club-race')).not.toBeNull()
  })

  it('is listed in the table of contents', () => {
    renderPage()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /worldwide club race/i })
    ).toHaveAttribute('href', '#club-race')
  })

  it('states the basis: Distinguished when the requirements are met, which may precede TI', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(
      /recognises a club as Distinguished when it meets the requirements/i
    )
    expect(txt).toMatch(/may precede/i)
    expect(txt).toMatch(/April 30/)
  })

  it('states the membership basis switch at April 1', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/confirmed April renewals/i)
    expect(txt).toMatch(/April 1/)
    expect(txt).toMatch(/active members/i)
  })

  it('states that crossings are sticky and dates are snapshot windows', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/never revised/i)
    expect(txt).toMatch(/between A and B/i)
  })

  it('states the no-bottom commitment', () => {
    renderPage()
    expect(sectionText()).toMatch(/no global list with a bottom/i)
  })

  /* #1570 — the tiles count exclusively while the lists stay cumulative, so
     the page reads 31 Distinguished above a 35-row Distinguished list. The
     rule has to be written down, not inferred. */
  it('states the counting rule: once, at the level the club holds now', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/counted once/i)
    expect(txt).toMatch(/level it holds now/i)
    expect(txt).toMatch(/every tier it has reached/i)
  })
})
