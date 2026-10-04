/* /methodology — Top-3 award ties match the code (#1610).
   The calculator gives tied districts a shared rank and no secondary key;
   the page must not claim a paid-club tie-break that doesn't exist. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

const pageText = () => {
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  )
  return document.body.textContent || ''
}

describe('MethodologyPage — Top-3 award ties (#1610)', () => {
  it('does not claim ties are broken by paid-club counts', () => {
    const txt = pageText()
    expect(txt).not.toMatch(/broken by raw paid-club counts/i)
  })

  it("says tied districts share a rank because TI's tie-break isn't published", () => {
    const txt = pageText()
    expect(txt).toMatch(/share a rank/i)
    expect(txt).toMatch(/tie-break isn.t published/i)
  })
})
