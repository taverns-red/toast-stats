/* /methodology — why the Club Strength Award appears for past years only
   (#2907). */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

describe('MethodologyPage — Club Strength Award (#2907)', () => {
  it('says TI removed the award in March 2026 and which years still show it', () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    const txt = document.body.textContent || ''
    expect(txt).toMatch(
      /Club Strength Award[\s\S]{0,300}removed[\s\S]{0,100}March 2026/i
    )
    expect(txt).toMatch(/Club Strength Award[\s\S]{0,500}2024.25/i)
  })
})
