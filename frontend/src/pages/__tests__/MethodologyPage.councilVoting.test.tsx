/* /methodology — "Council voting strength" section (#2300).
 *
 * The council credentials page links here. The section pins TI's rule with
 * its sources (Policy 2.0 §4; DAB Art. IX(a), X(c), X(d); DLH p.86–87), the
 * dues-period rule, the snapshot choice, and what the derived list cannot
 * know. */

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
  screen.getByTestId('methodology-council-voting').textContent || ''

describe('MethodologyPage — council voting strength (#2300)', () => {
  it('has its own section, reachable by #council-voting-strength and in the TOC', () => {
    renderPage()
    expect(document.getElementById('council-voting-strength')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /council voting strength/i })
    ).toHaveAttribute('href', '#council-voting-strength')
  })

  it('cites the TI rules it follows', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/Policy 2\.0.{0,3}§4/)
    expect(txt).toMatch(/DAB Art\. IX\(a\)/)
    expect(txt).toMatch(/X\(d\)/)
    expect(txt).toMatch(/X\(c\)/)
    expect(txt).toMatch(/p\.\s?86/)
    expect(txt).toMatch(/p\.\s?87/)
  })

  it('states the rule: 8 paid, 3 renewing, 2 votes, one-third quorum rounded up', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/eight \(8\) members/i)
    expect(txt).toMatch(/three \(3\)/i)
    expect(txt).toMatch(/two votes/i)
    expect(txt).toMatch(/one-third/i)
    expect(txt).toMatch(/rounded up/i)
  })

  it('explains the dues-period boundary, staleness and the derived-list limits', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/April 1 and October 1/)
    expect(txt).toMatch(/no count/i)
    expect(txt).toMatch(/7 days/)
    expect(txt).toMatch(/District Central/)
    expect(txt).toMatch(/not TI.s official credentials list/i)
  })
})
