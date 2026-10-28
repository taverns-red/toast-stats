/* /methodology — District Success Plan targets (#2297).
 *
 * The Overview's targets panel and the Trends target line come from a
 * leader's own link, not from TI. This section says what the three goal
 * areas are (Item 431), how they map to the KPIs, that the link is the only
 * store, and how the param is read. */

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
  screen.getByTestId('methodology-success-plan-targets').textContent || ''

describe('MethodologyPage — Success Plan targets (#2297)', () => {
  it('has its own section, reachable by #success-plan-targets and in the TOC', () => {
    renderPage()
    expect(document.getElementById('success-plan-targets')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /^success plan targets$/i })
    ).toHaveAttribute('href', '#success-plan-targets')
  })

  it('cites the District Success Plan goal areas to Item 431', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/Item 431/)
    expect(txt).toMatch(/Membership Payments Growth/)
    expect(txt).toMatch(/Club Growth/)
    expect(txt).toMatch(/Distinguished Clubs/)
  })

  it('says the link is the only store and the targets are not TI’s', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/\?targets=/)
    expect(txt).toMatch(/not from Toastmasters International/i)
    expect(txt).toMatch(/no account/i)
    expect(txt).toMatch(/program year/i)
  })
})
