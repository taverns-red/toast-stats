/**
 * Active state of the primary nav (#2646, LAND-12 / CHR-12).
 *
 * The pages people use most — /district/* and /region/* — showed no active
 * nav item, because Districts matched `/` exactly and Regions matched only
 * `/regions`. The active item now follows the section the URL is in.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DarkModeProvider } from '../../../contexts/DarkModeContext'
import AppShellTopBar from '../AppShellTopBar'

afterEach(() => cleanup())

const renderAt = (path: string) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DarkModeProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppShellTopBar onOpenSearch={() => {}} />
        </MemoryRouter>
      </DarkModeProvider>
    </QueryClientProvider>
  )

/** Names of the primary-nav links that carry aria-current="page". */
const currentLinks = (): string[] => {
  const nav = screen.getByRole('navigation', { name: /primary/i })
  return within(nav)
    .getAllByRole('link')
    .filter(a => a.getAttribute('aria-current') === 'page')
    .map(a => a.textContent ?? '')
}

describe('AppShellTopBar active nav item (#2646)', () => {
  it.each([
    ['/', 'Districts'],
    ['/district/61', 'Districts'],
    ['/district/61/clubs', 'Districts'],
    ['/district/61/division/A/area/01', 'Districts'],
    ['/district/61/club/123', 'Districts'],
    ['/regions', 'Regions'],
    ['/regions/health', 'Regions'],
    ['/region/04', 'Regions'],
    ['/region/4/growth/survival', 'Regions'],
    ['/awards', 'Awards'],
    ['/clubs', 'Clubs'],
    ['/history', 'History'],
    ['/methodology', 'How it works'],
  ])('%s marks exactly "%s" current', (path, label) => {
    renderAt(path)
    expect(currentLinks()).toEqual([label])
  })

  it('marks nothing current on a page that is not a nav section', () => {
    renderAt('/mcp')
    expect(currentLinks()).toEqual([])
  })
})
