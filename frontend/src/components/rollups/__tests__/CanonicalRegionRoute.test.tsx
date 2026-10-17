/**
 * CanonicalRegionRoute (#2130) — `/region/1` and every region subpage
 * redirect to the padded canonical URL, keeping the subpath and query.
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CanonicalRegionRoute } from '../CanonicalRegionRoute'

afterEach(cleanup)

const Where: React.FC = () => {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{`${pathname}${search}`}</p>
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/region/:n"
          element={
            <CanonicalRegionRoute>
              <Where />
            </CanonicalRegionRoute>
          }
        />
        <Route
          path="/region/:n/health"
          element={
            <CanonicalRegionRoute>
              <Where />
            </CanonicalRegionRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  )

describe('CanonicalRegionRoute', () => {
  it('redirects the unpadded landing page, keeping the query', async () => {
    renderAt('/region/1?sort=payments&dir=asc')
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/region/01?sort=payments&dir=asc'
    )
  })

  it('redirects the unpadded health subpage, keeping subpath and query', async () => {
    renderAt('/region/1/health?py=2025')
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/region/01/health?py=2025'
    )
  })

  it('renders a canonical URL without redirecting', () => {
    renderAt('/region/07/health')
    expect(screen.getByTestId('where')).toHaveTextContent('/region/07/health')
  })
})
