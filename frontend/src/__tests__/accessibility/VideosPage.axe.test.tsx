// Full-page axe scan of /videos (#2658), with the steps lists open.
//
// axe's `color-contrast` rule is off under JSDOM; this file owns the
// structural rules (list semantics, link names, the jump nav's label).

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { MemoryRouter } from 'react-router-dom'
import VideosPage from '../../pages/VideosPage'

expect.extend(toHaveNoViolations)

afterEach(() => cleanup())

describe('VideosPage accessibility (#2658)', () => {
  it('has no axe violations, with every steps list open', async () => {
    const { container } = render(
      <MemoryRouter>
        <VideosPage />
      </MemoryRouter>
    )
    for (const d of container.querySelectorAll('details')) d.open = true
    expect(await axe(container)).toHaveNoViolations()
  })
})
