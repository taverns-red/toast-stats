/* /methodology — President's 20-Plus Award is scoped to ACTIVE clubs (#1611,
   Item 1490). */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

describe("MethodologyPage — President's 20-Plus Award (#1611)", () => {
  it('ranks by the percentage of ACTIVE clubs with 20+ paid members', () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    const txt = document.body.textContent || ''
    expect(txt).toMatch(
      /percentage of active clubs achieving 20\+ paid members/i
    )
    expect(txt).not.toMatch(/percentage of clubs achieving 20\+/i)
  })
})
