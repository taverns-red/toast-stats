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

  // Spec change (#2554, Ron 2026-11-08): the KPI card shows the confirmed
  // count with "+N provisional" beside it, not clubs qualifying today.
  it('explains the KPI card as the confirmed count with provisional beside it', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/KPI card/i)
    expect(txt).toMatch(/\+N provisional/)
    expect(txt).not.toMatch(/KPI card counts the clubs/i)
    expect(txt).not.toMatch(/KPI card counts paid clubs only/i)
    expect(txt).not.toMatch(/gap can be larger than the KPI card/i)
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
    // and the rankings. The KPI card shares that base (#2554).
    expect(txt).toMatch(
      /every club on Toastmasters International.s club report/i
    )
    expect(txt).toMatch(/paid or not/i)
    // Provisional is shown beside confirmed, never added to it.
    expect(txt).toMatch(/provisional/i)
    expect(txt).toMatch(/never added/i)
  })

  // #2580 (#2579 review): the source note must say what stands in until the
  // daily run publishes distinguishedCounts, or a reader cannot reconcile a
  // number that moves when it lands.
  it('names the rankings-row fallback used until distinguishedCounts is published (#2580)', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/until the daily run publishes/i)
    expect(txt).toMatch(/rankings row/i)
    expect(txt).toMatch(/distinguishedClubs/)
  })

  it('cites the TI Distinguished Club Program source', () => {
    renderPage()
    expect(sectionText()).toMatch(/Distinguished Club Program.*Item 1111/)
  })
})
