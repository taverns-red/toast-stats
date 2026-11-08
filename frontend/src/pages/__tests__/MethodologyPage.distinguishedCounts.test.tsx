/* /methodology — the two Distinguished-club counts on the Overview (#2390).
 *
 * The KPI card counts clubs qualifying today; the trophy case's gap counts
 * confirmed clubs. Ron kept both (2026-10-28), so this section says what
 * each one counts, why they differ, and cites the TI source. The trophy
 * case's "How we count" link lands here. */

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
  screen.getByTestId('methodology-distinguished-club-counts').textContent || ''

describe('MethodologyPage — Distinguished club counts (#2390)', () => {
  it('has its own section as §19, in the TOC, before the Changelog (§20)', () => {
    renderPage()
    expect(document.getElementById('distinguished-club-counts')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /^distinguished club counts$/i })
    ).toHaveAttribute('href', '#distinguished-club-counts')
    const links = within(toc)
      .getAllByRole('link')
      .map(a => a.getAttribute('href'))
    expect(links.slice(-2)).toEqual([
      '#distinguished-club-counts',
      '#changelog',
    ])
  })

  it('explains the KPI count as clubs qualifying today', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/qualifying today/i)
    expect(txt).toMatch(/KPI card/i)
  })

  it('explains the trophy-case gap as confirmed clubs, on April renewals before TI reports', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/confirmed/i)
    expect(txt).toMatch(/Gap to Distinguished District/)
    expect(txt).toMatch(/April renewals/i)
    expect(txt).toMatch(/share card/i)
  })

  it('states the club base of the confirmed and provisional counts (#2553)', () => {
    renderPage()
    const txt = sectionText()
    // Every club on TI's report, paid or not: the base of TI's own count
    // and the rankings. The KPI card counts paid clubs only.
    expect(txt).toMatch(
      /every club on Toastmasters International.s club report/i
    )
    expect(txt).toMatch(/paid or not/i)
    expect(txt).toMatch(/KPI card counts paid clubs only/i)
    // Provisional is shown beside confirmed, never added to it.
    expect(txt).toMatch(/provisional/i)
    expect(txt).toMatch(/never added/i)
  })

  it('cites the TI Distinguished Club Program source', () => {
    renderPage()
    expect(sectionText()).toMatch(/Distinguished Club Program.*Item 1111/)
  })
})
