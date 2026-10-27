/* /methodology — "Member-level data" section (#2302).
 *
 * Club officers ask for member retention, per-member Pathways progress,
 * guest funnels or officer names. The site has none of these by design;
 * this section says so, says why (privacy; the public dashboards publish
 * club-and-up totals), points to TI's Club Central, and promises nothing. */

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

const section = (): HTMLElement => screen.getByTestId('methodology-member-data')
const sectionText = (): string => section().textContent || ''

describe('MethodologyPage — member-level data is out of scope (#2302)', () => {
  it('has its own section, reachable by #member-data and listed in the TOC', () => {
    renderPage()
    expect(document.getElementById('member-data')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /member-level data/i })
    ).toHaveAttribute('href', '#member-data')
  })

  it('names what is not here: members, names, contacts, per-member retention', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/individual members/i)
    expect(txt).toMatch(/names/i)
    expect(txt).toMatch(/contact details/i)
    expect(txt).toMatch(/retention/i)
    expect(txt).toMatch(/by design/i)
  })

  it('says why: privacy, and the public dashboards are aggregates', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/privacy/i)
    expect(txt).toMatch(/club, area, division and district/i)
  })

  it("points to TI's Club Central for member-level data", () => {
    renderPage()
    expect(
      within(section()).getByRole('link', { name: /club central/i })
    ).toHaveAttribute(
      'href',
      'https://www.toastmasters.org/my-toastmasters/profile/club-central'
    )
  })

  it('promises no future member-level features', () => {
    renderPage()
    expect(sectionText()).not.toMatch(
      /coming soon|planned|roadmap|in the future|later release|we will add/i
    )
  })
})
