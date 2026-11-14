/**
 * AppShell layout tests — assert chrome-level placement of controls
 * that have moved between header and footer over time (#565).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import AppShell from '../AppShell'
import { DarkModeProvider } from '../../../contexts/DarkModeContext'
import { ProgramYearProvider } from '../../../contexts/ProgramYearContext'
import { openConsentSettings, setConsent } from '../../../utils/consent'

afterEach(() => {
  cleanup()
  document.cookie = 'rt_consent=; Max-Age=0; Path=/'
})

const renderShell = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProgramYearProvider>
        <DarkModeProvider>
          <MemoryRouter>
            <AppShell />
          </MemoryRouter>
        </DarkModeProvider>
      </ProgramYearProvider>
    </QueryClientProvider>
  )
}

describe('AppShell layout (#565)', () => {
  it('renders the theme toggle inside the header banner, not the footer', () => {
    renderShell()
    const banner = screen.getByRole('banner')
    const toggle = screen.getByRole('button', {
      name: /switch to (dark|light) mode/i,
    })
    expect(banner.contains(toggle)).toBe(true)

    const footer = screen.getByRole('contentinfo')
    expect(footer.contains(toggle)).toBe(false)
  })

  it('places the theme toggle between the help icon and the avatar in the header tools cluster', () => {
    renderShell()
    const banner = screen.getByRole('banner')
    // The "How it works" text appears twice in the banner (nav link +
    // tools-cluster icon button). The help icon in the tools cluster is
    // the one with the explicit aria-label, identified by its title
    // attribute as well.
    const helpIcon = within(banner).getByTitle('How it works')
    const toggle = within(banner).getByRole('button', {
      name: /switch to (dark|light) mode/i,
    })
    const avatar = within(banner).getByRole('img', {
      name: /account.*placeholder/i,
    })

    // DOM order: help → toggle → avatar
    const allEls = Array.from(banner.querySelectorAll('*'))
    expect(allEls.indexOf(helpIcon)).toBeLessThan(allEls.indexOf(toggle))
    expect(allEls.indexOf(toggle)).toBeLessThan(allEls.indexOf(avatar))
  })

  /* #2587: a keyboard user must reach the consent choice without tabbing
     through the whole page. The banner is position: fixed, so where it sits
     in the DOM does not change the layout. */
  it('puts the consent banner after the skip link and before the page content in tab order', () => {
    setConsent('minimal')
    renderShell()
    act(() => openConsentSettings())
    const region = screen.getByRole('region', { name: 'Privacy and cookies' })
    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(skip, region)).toBe(true)
    expect(follows(region, screen.getByRole('banner'))).toBe(true)
    expect(follows(region, screen.getByRole('main'))).toBe(true)
    expect(follows(region, screen.getByRole('contentinfo'))).toBe(true)
  })
})
