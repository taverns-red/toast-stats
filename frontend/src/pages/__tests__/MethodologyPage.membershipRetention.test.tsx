/* /methodology — President's Membership Retention Award estimate (#1614).
   The /awards card's footnote links here. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

const section = () => {
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  )
  const el = document.getElementById('membership-retention-award')
  expect(el, '#membership-retention-award section').not.toBeNull()
  return (el!.textContent || '').replace(/\s+/g, ' ')
}

describe('MethodologyPage — membership retention estimate (#1614)', () => {
  it('gives the formula', () => {
    const txt = section()
    expect(txt).toMatch(/April renewals/)
    expect(txt).toMatch(/October renewals/)
    expect(txt).toMatch(/late renewals/)
    expect(txt).toMatch(/new members before April/)
    expect(txt).toMatch(/charter members before April/)
  })

  it('names the data source and the March 31 close', () => {
    const txt = section()
    expect(txt).toMatch(/dashboard/i)
    expect(txt).toMatch(/March 31 close/)
  })

  it('gives the window, final on June 30', () => {
    const txt = section()
    expect(txt).toMatch(/April 1 to June 30/)
    expect(txt).toMatch(/final on June 30/i)
  })

  it('says what July shows and where last year’s result is', () => {
    const txt = section()
    expect(txt).toMatch(/From July 1/)
    expect(txt).toMatch(/last year.s final standings are on the June 30 date/i)
  })

  it('leaves out U and ranks F', () => {
    const txt = section()
    expect(txt).toMatch(/District U[^.]*left out/)
    expect(txt).toMatch(/District F is ranked/)
  })

  it('cites Item 1490 Rev. 07/2026 p. 17', () => {
    expect(section()).toMatch(/Item 1490,? Rev\. 07\/2026,? p\. 17/)
  })

  it('says it is our estimate, not TI’s result', () => {
    const txt = section()
    expect(txt).toMatch(/estimate/i)
    expect(txt).toMatch(/not Toastmasters International.s result/)
  })
})
