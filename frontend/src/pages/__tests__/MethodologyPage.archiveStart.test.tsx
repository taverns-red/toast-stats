/* /methodology's archive-start caveat agrees with /history (#2657, REF-23).
   It used to say snapshots start at PY 2019-20 while /history shows cards
   from 2016-17. Both now read the one earliest-archived-year constant. */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MethodologyPage from '../MethodologyPage'

describe('MethodologyPage — archive start (#2657)', () => {
  it('names the same earliest year as /history, not 2019', () => {
    render(
      <MemoryRouter>
        <MethodologyPage />
      </MemoryRouter>
    )
    const txt = document.body.textContent || ''
    expect(txt).not.toMatch(/Pre-2019|2019–20 onward/)
    // v1/dates.json starts at 2017-01-31, so PY 2016-17 is the first year.
    expect(txt).toContain('from PY 2016-17 onward')
  })
})
