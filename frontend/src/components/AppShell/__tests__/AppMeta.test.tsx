import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppMeta from '../AppMeta'

const ISSUES_URL =
  'https://github.com/taverns-red/toast-stats/issues/new/choose'

function renderMeta() {
  return render(
    <MemoryRouter>
      <AppMeta />
    </MemoryRouter>
  )
}

describe('AppMeta — report an issue (#1356)', () => {
  it('exposes a "Report an issue" link to the issue chooser', () => {
    renderMeta()

    const link = screen.getByRole('link', { name: /report an issue/i })
    expect(link).toHaveAttribute('href', ISSUES_URL)
  })

  // Every other external link here opens in a new tab; this one must not
  // navigate the user away from the data they are trying to report on.
  it('opens in a new tab with a safe rel', () => {
    renderMeta()

    const link = screen.getByRole('link', { name: /report an issue/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // AppMeta renders in BOTH the desktop footer and the mobile "About ▾"
  // disclosure (#889). Asserting on AppMeta itself is what makes the link
  // reachable at every breakpoint rather than desktop-only.
  it('renders the link as part of the shared meta strip', () => {
    renderMeta()

    const link = screen.getByRole('link', { name: /report an issue/i })
    expect(link).toHaveClass('app-shell-footer__link')
  })

  // AppMeta's own comment warns that the "MIT License · <version>" pairing
  // must stay adjacent — AppShellTopBar.about.test.tsx:74 asserts it. A new
  // link inserted between them would break that guard, so pin it here too:
  // this file is where someone adding the NEXT link will look.
  it('keeps "MIT License · <version>" adjacent', () => {
    renderMeta()

    const text = screen.getByTestId('app-version').textContent ?? ''
    expect(text).toMatch(/MIT License\s*·\s*(?:v?\d|dev)/i)
  })
})
