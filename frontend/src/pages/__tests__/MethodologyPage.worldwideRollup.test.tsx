/* /methodology — the "Worldwide rollup" section (#1500, epic #1496 Sprint 4).
 *
 * The operator ruling of 2026-08-31 is "publish our numbers with our
 * definitions stated". The definitions therefore have to be ON the page, not
 * implied by the table — and the ruled ones are load-bearing enough that
 * asserting the literal wording is the point of these tests. */

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
  screen.getByTestId('methodology-worldwide-rollup').textContent || ''

describe('MethodologyPage — Worldwide rollup (#1500)', () => {
  it('has a section reachable by the anchor the /history table links to', () => {
    renderPage()
    const section = screen.getByTestId('methodology-worldwide-rollup')
    expect(section).toBeInTheDocument()
    expect(document.getElementById('worldwide-rollup')).not.toBeNull()
  })

  it('is listed in the table of contents', () => {
    renderPage()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /worldwide rollup/i })
    ).toHaveAttribute('href', '#worldwide-rollup')
  })

  it('states the June-30 membership basis and the March-31 basis alongside it', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/June 30/)
    expect(txt).toMatch(/March 31/)
  })

  it('states the ruled average-club-size basis verbatim', () => {
    renderPage()
    expect(sectionText()).toMatch(/June-30 membership ÷ paid clubs/i)
  })

  it('states that undistricted U is included and the district count stated separately', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/undistricted/i)
    expect(txt).toMatch(/included/i)
  })

  it('distinguishes "new clubs still active" from TI\'s "new clubs"', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/new clubs still active/i)
    expect(txt).toMatch(/report basis/i)
    expect(txt).toMatch(/2026-2027/)
  })

  it('states that education counts raw achievement activity, not DCP credit', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/education/i)
    expect(txt).toMatch(/not DCP credit/i)
  })

  it('states the posture: our numbers, our definitions; a CEO-report match validates', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/validation/i)
    expect(txt).toMatch(/not a target|never a target/i)
  })

  it('states the scope rule: the date’s own district set, each club counted once', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/district set/i)
    expect(txt).toMatch(/once/i)
  })

  it('states that Smedley did not exist before 2025-2026 and is not zero', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/Smedley/i)
    expect(txt).toMatch(/2025-2026/)
    expect(txt).toMatch(/not zero/i)
  })

  it('links back to /history, the surface the rollup is published on (#373 pattern)', () => {
    renderPage()
    const section = screen.getByTestId('methodology-worldwide-rollup')
    expect(
      within(section).getByRole('link', { name: /program year history/i })
    ).toHaveAttribute('href', '/history')
  })
})
