/* /methodology — District Leadership Excellence Award rule and its known
   divergence from TI's published 2025–26 recipients (#1609). */

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

describe('MethodologyPage — Leadership Excellence (#1609)', () => {
  it('states that the award year itself counts toward the 3-year streak', () => {
    expect(pageText()).toMatch(
      /leadership excellence[\s\S]{0,200}award year itself counts/i
    )
  })

  it('says mid-year districts are on track and recipients appear only at the year-end close', () => {
    const txt = pageText()
    expect(txt).toMatch(/on track/i)
    expect(txt).toMatch(/only once the year-end close is in/i)
  })

  it('documents the 2025–26 divergence: 94, 109 and 93 qualify by the rule but TI did not list them', () => {
    expect(pageText()).toMatch(
      /Districts 94, 109 and 93[\s\S]{0,200}did not list/i
    )
  })
})
