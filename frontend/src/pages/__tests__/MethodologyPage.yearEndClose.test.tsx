/* /methodology — year-end close charter scoping and retention > 100% (#1622). */

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

describe('MethodologyPage — year-end close and retention (#1622)', () => {
  it('says the July-published year-end close counts charters from the PY it closes', () => {
    expect(pageText()).toMatch(
      /year-end close[\s\S]{0,80}still counts charters from the program year it closes/i
    )
  })

  it('explains the only way retention can exceed 100%', () => {
    expect(pageText()).toMatch(
      /retention can exceed 100% only when clubs outside the base/i
    )
  })
})
