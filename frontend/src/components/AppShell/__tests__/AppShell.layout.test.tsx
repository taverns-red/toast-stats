/**
 * AppShell layout tests — assert chrome-level placement of controls
 * that have moved between header and footer over time (#565).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import AppShell from '../AppShell'
import { DarkModeProvider } from '../../../contexts/DarkModeContext'
import { ProgramYearProvider } from '../../../contexts/ProgramYearContext'

afterEach(() => cleanup())

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
    const helpIcon = within(banner).getByRole('link', { name: /how it works/i })
    const toggle = within(banner).getByRole('button', {
      name: /switch to (dark|light) mode/i,
    })
    const avatar = within(banner).getByRole('img', {
      name: /account.*placeholder/i,
    })

    // DOM order: help → toggle → avatar
    const helpPos = Array.from(banner.querySelectorAll('*')).indexOf(helpIcon)
    const togglePos = Array.from(banner.querySelectorAll('*')).indexOf(toggle)
    const avatarPos = Array.from(banner.querySelectorAll('*')).indexOf(avatar)
    expect(helpPos).toBeLessThan(togglePos)
    expect(togglePos).toBeLessThan(avatarPos)
  })
})
