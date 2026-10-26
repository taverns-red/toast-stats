/* /methodology — the "Officer training" section (#2296).
 *
 * The Training page, the Action List section and the division/area counts
 * link here. It states the definition, the source columns, the round
 * windows and that TI reports a count only, not which officers — and it is
 * its own section, not part of anything about education. */

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
  screen.getByTestId('methodology-officer-training').textContent || ''

describe('MethodologyPage — Officer training (#2296)', () => {
  it('has its own section, reachable by #officer-training and listed in the TOC', () => {
    renderPage()
    expect(document.getElementById('officer-training')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /^officer training$/i })
    ).toHaveAttribute('href', '#officer-training')
  })

  it('defines the measure from its source columns and round windows', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toContain('Off. Trained Round 1')
    expect(txt).toContain('Off. Trained Round 2')
    expect(txt).toMatch(/June 1.*August 31/)
    expect(txt).toMatch(/November 1.*last day of February/)
    expect(txt).toMatch(/4 or more officers trained in each round/i)
  })

  it('says the count is a count only, not which officers', () => {
    renderPage()
    expect(sectionText()).toMatch(/count only, not which officers/i)
  })

  it('is not presented as part of education', () => {
    renderPage()
    expect(sectionText()).not.toMatch(/education/i)
  })
})
