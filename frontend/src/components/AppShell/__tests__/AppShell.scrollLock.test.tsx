/* Scroll locks compose (#2638 review). The phone menu and the command
   palette each lock page scroll. On a phone the Search button sits inside the
   header, so tapping it leaves the menu open under the palette. Closing both
   in one commit must hand the page back its original overflow, whatever order
   the two cleanups run in. */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DarkModeProvider } from '../../../contexts/DarkModeContext'
import AppShellTopBar from '../AppShellTopBar'
import CommandPalette from '../CommandPalette'

vi.mock('../../../services/cdn', () => ({
  fetchCdnRankings: vi.fn().mockResolvedValue({ rankings: [], asOfDate: '' }),
  fetchCdnClubIndex: vi.fn().mockResolvedValue({ clubs: {} }),
  fetchCdnDivisionsAreasIndex: vi.fn().mockResolvedValue({
    generatedAt: '',
    snapshotDate: '',
    totalDivisions: 0,
    totalAreas: 0,
    districts: {},
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
}))

const Shell: React.FC = () => {
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <DarkModeProvider>
        <MemoryRouter>
          <AppShellTopBar onOpenSearch={() => setPaletteOpen(true)} />
          <CommandPalette
            isOpen={paletteOpen}
            onClose={() => setPaletteOpen(false)}
          />
        </MemoryRouter>
      </DarkModeProvider>
    </QueryClientProvider>
  )
}

describe('scroll locks compose (#2638)', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    // A phone: the menu locks scroll only below 768px.
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })) as unknown as typeof window.matchMedia
  })
  afterEach(() => {
    cleanup()
    document.body.style.overflow = ''
  })

  it('menu open, then palette open, then both closed in one act: scroll comes back', () => {
    render(<Shell />)
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('opening the palette closes the phone menu', () => {
    render(<Shell />)
    const toggle = screen.getByRole('button', { name: /open menu/i })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
