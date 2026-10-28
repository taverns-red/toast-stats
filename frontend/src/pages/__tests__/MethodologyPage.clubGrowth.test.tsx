/* /methodology — Club Growth prospective clubs (#2388).
 *
 * The district funnel's Progress and Waiting on columns and the region/world
 * "By progress" table read TI's Prospect cell as a checklist. This section
 * says how: steps done in any order, a step can go back, which step a club
 * waits on, and what a step TI does not list yet counts from. */

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

describe('MethodologyPage — Club Growth prospective clubs (#2388)', () => {
  it('has its own section, reachable by #club-growth-prospective and in the TOC', () => {
    renderPage()
    expect(document.getElementById('club-growth-prospective')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /^prospective clubs$/i })
    ).toHaveAttribute('href', '#club-growth-prospective')
  })

  it('describes the checklist honestly', () => {
    renderPage()
    const txt =
      screen.getByTestId('methodology-club-growth-prospective').textContent ||
      ''
    expect(txt).toMatch(/six steps/i)
    expect(txt).toMatch(/any order/i)
    expect(txt).toMatch(/back to Incomplete/i)
    expect(txt).toMatch(/last changed/i)
    expect(txt).toMatch(/not listed yet/i)
    expect(txt).toMatch(/most recent step date/i)
    expect(txt).toMatch(/most steps complete first, then longest waiting/i)
    expect(txt).toMatch(/region.*sum/i)
  })
})
