import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { DistrictAnalyticsRedirect } from '../DistrictAnalyticsRedirect'

/* /district/:id/analytics is retired (#2159): it redirects client-side with a
   history REPLACE, so Back skips the dead URL instead of bouncing on it. */

const renderAt = (entries: string[]) => {
  const router = createMemoryRouter(
    [
      { path: '/district/:districtId', element: <p>hub</p> },
      {
        path: '/district/:districtId/analytics',
        element: <DistrictAnalyticsRedirect />,
      },
      { path: '/district/:districtId/clubs', element: <p>clubs</p> },
      { path: '/district/:districtId/education', element: <p>education</p> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 }
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => cleanup())

describe('DistrictAnalyticsRedirect (#2159)', () => {
  it('replaces /analytics with Clubs sorted by net change, keeping py and date', async () => {
    const router = renderAt([
      '/district/61',
      '/district/61/analytics?py=2025&date=2026-03-31',
    ])
    expect(await screen.findByText('clubs')).toBeInTheDocument()
    const { pathname, search } = router.state.location
    expect(pathname).toBe('/district/61/clubs')
    const params = new URLSearchParams(search)
    expect(params.get('py')).toBe('2025')
    expect(params.get('date')).toBe('2026-03-31')
    expect(params.get('sort')).toBe('netChange')
    expect(params.get('dir')).toBe('desc')
    expect(router.state.historyAction).toBe('REPLACE')

    // Back goes to the page before /analytics, not to /analytics.
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/district/61')
  })

  it('keeps #education-awards going to the Education leaderboards', async () => {
    const router = renderAt(['/district/61/analytics?py=2025#education-awards'])
    expect(await screen.findByText('education')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/district/61/education')
    expect(router.state.location.search).toBe('?py=2025')
    expect(router.state.location.hash).toBe('#leaderboards')
    expect(router.state.historyAction).toBe('REPLACE')
  })
})
