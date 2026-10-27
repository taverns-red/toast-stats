/* /methodology — the region District Recognition scoreboard entry (#2307).
 *
 * The Region page's scoreboard links here. It says what "meeting" a tier
 * means (the program year's own thresholds and prerequisites, Item 1490),
 * that tiers are cumulative, how the nearest district is chosen, and what
 * Unknown is. */

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
  screen.getByTestId('methodology-region-recognition').textContent || ''

describe('MethodologyPage — region District Recognition scoreboard (#2307)', () => {
  it('has its own section, reachable by #region-recognition and in the TOC', () => {
    renderPage()
    expect(document.getElementById('region-recognition')).not.toBeNull()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(toc).getByRole('link', { name: /^region district recognition$/i })
    ).toHaveAttribute('href', '#region-recognition')
  })

  it('defines meeting a tier by the program year rules and prerequisites', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/Item 1490/)
    expect(txt).toMatch(/program year/i)
    expect(txt).toMatch(/prerequisite/i)
    expect(txt).toMatch(/at that tier or higher/i)
  })

  it('explains the nearest district and Unknown', () => {
    renderPage()
    const txt = sectionText()
    expect(txt).toMatch(/nearest/i)
    expect(txt).toMatch(/share of its base/i)
    expect(txt).toMatch(/not reported/i)
  })
})
