/**
 * One GA page_view per page load and per real navigation (#1946).
 *
 * Prod sent 4 page_views per load of `/` (3 on /district/61, 2 on a club
 * page) and 2 per SPA navigation. Three senders were stacked:
 *
 * 1. `gtag('config', …)` sends a page_view by default (send_page_view).
 * 2. `useGoogleAnalytics` pushed a manual page_view for every
 *    pathname+search change — including the landing's URL-state
 *    `replaceState`s (?regions=, ?date=), all queued until the deferred
 *    gtag library loaded (#1906) and then flushed together.
 * 3. The property's Enhanced Measurement "page changes based on browser
 *    history events" sends its own page_view on every pushState/replaceState
 *    — and per Google's docs it does so even with send_page_view: false
 *    (https://developers.google.com/analytics/devguides/collection/ga4/views).
 *
 * (3) cannot be turned off from code, so gtag owns page_view: (1) counts the
 * load, (3) counts navigations, and the app must never send its own.
 * The prod-network proof is e2e/ga-page-view.smoke.ts.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppShell from '../../components/AppShell/AppShell'
import { DarkModeProvider } from '../../contexts/DarkModeContext'

vi.mock('../../services/cdn', () => ({
  fetchCdnRankings: vi.fn().mockResolvedValue({ rankings: [], asOfDate: '' }),
  fetchCdnClubIndex: vi.fn().mockResolvedValue({ clubs: {} }),
  fetchCdnDivisionsAreasIndex: vi.fn().mockResolvedValue({ districts: {} }),
}))

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}))

const renderShell = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <div>Home</div> },
          { path: 'methodology', element: <div>Methodology</div> },
        ],
      },
    ],
    { initialEntries: ['/'] }
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <DarkModeProvider>
        <RouterProvider router={router} />
      </DarkModeProvider>
    </QueryClientProvider>
  )
  return router
}

const pageViewCalls = (gtag: ReturnType<typeof vi.fn>) =>
  gtag.mock.calls.filter(c => c[0] === 'event' && c[1] === 'page_view')

describe('GA page_view ownership (#1946)', () => {
  let gtag: ReturnType<typeof vi.fn>

  beforeEach(() => {
    gtag = vi.fn()
    window.gtag = gtag
  })
  afterEach(() => {
    delete window.gtag
  })

  it('the app sends no page_view of its own on mount', () => {
    renderShell()
    expect(pageViewCalls(gtag)).toEqual([])
  })

  it('sends none for URL-state replaces or route changes either', async () => {
    const router = renderShell()
    await act(async () => {
      await router.navigate('/?date=2026-10-11', { replace: true })
      await router.navigate('/?date=2026-10-11&regions=01', { replace: true })
      await router.navigate('/methodology')
    })
    expect(pageViewCalls(gtag)).toEqual([])
  })

  it('leaves the load page_view to gtag config (send_page_view not disabled)', () => {
    const html = readFileSync(
      resolve(__dirname, '../../..', 'index.html'),
      'utf-8'
    )
    const config = html.match(/gtag\('config',\s*'G-CDWQYHC2Z3',\s*\{[^}]*\}/)
    expect(config).not.toBeNull()
    expect(config?.[0]).not.toMatch(/send_page_view/)
  })
})
