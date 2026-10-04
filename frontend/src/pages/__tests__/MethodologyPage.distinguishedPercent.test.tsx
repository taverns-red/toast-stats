/* /methodology — Distinguished Percent uses the club base (#1615).
   Item 1490 and `calculateDistinguishedPercent` divide by paidClubBase (the
   program-year-start club count), not current paid clubs (lesson 60 / #684).
   The copy must say the same thing the code computes. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { calculateDistinguishedPercent } from '@taverns-red/analytics-core'
import MethodologyPage from '../MethodologyPage'

const renderPage = () =>
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  )

describe('MethodologyPage — Distinguished Percent denominator (#1615)', () => {
  it('the calculator divides by the club base, not current paid clubs', () => {
    // 50 Distinguished clubs, base 100, now 125 paid clubs → 50%, not 40%.
    expect(calculateDistinguishedPercent(50, 100)).toBe(50)
  })

  it('glossary defines Distinguished Percent against the club base', () => {
    renderPage()
    const term = screen.getByText('Distinguished Percent', { selector: 'dt' })
    const definition = term.nextElementSibling?.textContent ?? ''
    expect(definition).toMatch(/÷ club base/i)
    expect(definition).not.toMatch(/÷ paid clubs/i)
  })

  it('region Distinguished share is divided by the summed club bases', () => {
    renderPage()
    const txt = document.body.textContent || ''
    expect(txt).toMatch(
      /distinguished share[\s\S]{0,120}divided by the sum of paid-club bases/i
    )
    expect(txt).not.toMatch(
      /distinguished share[\s\S]{0,120}divided by the sum of paid clubs\./i
    )
  })
})
