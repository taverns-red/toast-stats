/**
 * AppShell Component Tests (#354)
 *
 * The AppShell wraps every route with the redesign chrome:
 * - Sticky top bar (brand mark + Districts/History/Methodology nav)
 * - Skip link for a11y
 * - Outlet for page content
 * - Minimalist footer per handoff spec, with theme toggle preserved
 *
 * Per Epic #352 scope decisions:
 *  - No notifications/help/avatar (no auth today)
 *  - Regions/Awards "soon" nav items are OMITTED entirely (not rendered as
 *    disabled stubs)
 */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import AppShell from '../../components/AppShell/AppShell'

const renderShell = (initialPath = '/') => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <div data-testid="page">Home</div> },
          {
            path: 'history',
            element: <div data-testid="page">History</div>,
          },
          {
            path: 'methodology',
            element: <div data-testid="page">Methodology</div>,
          },
        ],
      },
    ],
    { initialEntries: [initialPath] }
  )
  return render(<RouterProvider router={router} />)
}

describe('AppShell (#354)', () => {
  describe('top bar', () => {
    it('renders the brand mark with "TS" text', () => {
      renderShell()
      const brand = screen.getByLabelText(/toast stats home/i)
      expect(brand).toBeInTheDocument()
      expect(brand).toHaveTextContent('TS')
    })

    it('links the brand mark to the home route', () => {
      renderShell('/history')
      const brand = screen.getByLabelText(/toast stats home/i)
      expect(brand).toHaveAttribute('href', '/')
    })

    it('renders nav links: Districts, History, Methodology', () => {
      renderShell()
      const nav = screen.getByRole('navigation', { name: /primary/i })
      expect(
        within(nav).getByRole('link', { name: 'Districts' })
      ).toHaveAttribute('href', '/')
      expect(
        within(nav).getByRole('link', { name: 'History' })
      ).toHaveAttribute('href', '/history')
      expect(
        within(nav).getByRole('link', { name: 'Methodology' })
      ).toHaveAttribute('href', '/methodology')
    })

    it('does NOT render Regions or Awards "soon" stubs (omitted per Epic #352)', () => {
      renderShell()
      const nav = screen.getByRole('navigation', { name: /primary/i })
      expect(within(nav).queryByText(/regions/i)).not.toBeInTheDocument()
      expect(within(nav).queryByText(/awards/i)).not.toBeInTheDocument()
      expect(within(nav).queryByText(/soon/i)).not.toBeInTheDocument()
    })

    it('does NOT render notifications, help, or avatar elements (no auth today)', () => {
      renderShell()
      expect(
        screen.queryByRole('button', { name: /notifications/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /help/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('img', { name: /avatar|profile/i })
      ).not.toBeInTheDocument()
    })

    it('marks the active nav link with aria-current="page"', () => {
      renderShell('/history')
      const nav = screen.getByRole('navigation', { name: /primary/i })
      const historyLink = within(nav).getByRole('link', { name: 'History' })
      expect(historyLink).toHaveAttribute('aria-current', 'page')

      const districtsLink = within(nav).getByRole('link', { name: 'Districts' })
      expect(districtsLink).not.toHaveAttribute('aria-current')
    })
  })

  describe('footer', () => {
    it('renders the redesign attribution line', () => {
      renderShell()
      const footer = screen.getByRole('contentinfo')
      expect(footer).toHaveTextContent(/toast stats/i)
      expect(footer).toHaveTextContent(/ts\.taverns\.red/i)
      expect(footer).toHaveTextContent(/a red taverns production/i)
    })

    it('renders the data source + license + version line', () => {
      renderShell()
      const footer = screen.getByRole('contentinfo')
      expect(footer).toHaveTextContent(/data:\s*dashboards\.toastmasters\.org/i)
      expect(footer).toHaveTextContent(/mit license/i)
    })

    it('preserves the theme toggle for manual dark-mode access', () => {
      renderShell()
      const footer = screen.getByRole('contentinfo')
      expect(
        within(footer).getByRole('button', { name: /theme/i })
      ).toBeInTheDocument()
    })
  })

  describe('layout structure', () => {
    it('renders the routed page inside an <Outlet />', () => {
      renderShell('/history')
      expect(screen.getByTestId('page')).toHaveTextContent('History')
    })

    it('includes a skip link for keyboard users', () => {
      renderShell()
      const skip = screen.getByRole('link', { name: /skip to main content/i })
      expect(skip).toHaveAttribute('href', '#main-content')
    })

    it('marks the page region with id="main-content" for the skip link target', () => {
      renderShell()
      const main = screen.getByRole('main')
      expect(main).toHaveAttribute('id', 'main-content')
    })
  })
})
