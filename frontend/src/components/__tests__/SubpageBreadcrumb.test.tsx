/* #577 — Back-to-district breadcrumb for routed district sub-pages.
   The component is the single source of the breadcrumb affordance the
   District IA migration (epic #568) needs on every routed sub-page.
   Phase 3 pages (#571) drop it in with one line. */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { SubpageBreadcrumb } from '../SubpageBreadcrumb'

expect.extend(toHaveNoViolations)

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

describe('SubpageBreadcrumb (#577)', () => {
  it('renders a nav labelled "Breadcrumb"', () => {
    renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[{ label: 'District 61', to: '/district/61' }]}
      />
    )
    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' })
    ).toBeInTheDocument()
  })

  it('renders a linked crumb pointing at its target', () => {
    renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[{ label: 'District 61', to: '/district/61' }]}
      />
    )
    const link = screen.getByRole('link', { name: 'District 61' })
    expect(link).toHaveAttribute('href', '/district/61')
    // Strong affordance — not the weak text-gray-500 of the old crumb.
    expect(link).toHaveClass('text-tm-loyal-blue')
  })

  it('renders the final crumb (no `to`) as the current page, not a link', () => {
    renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[
          { label: 'District 61', to: '/district/61' },
          { label: 'Clubs', to: '/district/61/clubs' },
          { label: 'Ottawa Club' },
        ]}
      />
    )
    const current = screen.getByText('Ottawa Club')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(
      screen.queryByRole('link', { name: 'Ottawa Club' })
    ).not.toBeInTheDocument()
  })

  it('links intermediate crumbs (the Clubs step)', () => {
    renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[
          { label: 'District 61', to: '/district/61' },
          { label: 'Clubs', to: '/district/61/clubs?status=vulnerable' },
          { label: 'Ottawa Club' },
        ]}
      />
    )
    expect(screen.getByRole('link', { name: 'Clubs' })).toHaveAttribute(
      'href',
      '/district/61/clubs?status=vulnerable'
    )
  })

  it('renders separators between crumbs but hides them from a11y tree', () => {
    const { container } = renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[
          { label: 'District 61', to: '/district/61' },
          { label: 'Clubs', to: '/district/61/clubs' },
          { label: 'Ottawa Club' },
        ]}
      />
    )
    const seps = container.querySelectorAll('[aria-hidden="true"]')
    expect(seps.length).toBe(2)
  })

  /* #1387 — the linked crumb must centre its own content.
     `styles/layers/base.css` floors `a[href]` at 44px (48px from 1024px up,
     `styles/responsive.css`) for WCAG 2.5.5. The crumb `<a>` is a flex item of
     its `<li>`, so it is blockified and the floor applies: a 48px-tall box
     whose 20px line box paints at the TOP, while `align-items:center` centres
     the 21px separator spans — labels 14px above everything else.
     The fix centres the anchor's content inside the inflated box rather than
     shrinking the box (shrinking would break the touch target).
     This is the CONTRACT guard; the rendered pixels are proven by
     `e2e/breadcrumb-alignment.smoke.ts` — jsdom has no layout engine. */
  it('centres the linked crumb content inside its touch-target box (#1387)', () => {
    renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[
          { label: 'District 61', to: '/district/61' },
          { label: 'Ottawa Club' },
        ]}
      />
    )
    const link = screen.getByRole('link', { name: 'District 61' })
    expect(link).toHaveClass('inline-flex')
    expect(link).toHaveClass('items-center')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithRouter(
      <SubpageBreadcrumb
        crumbs={[
          { label: 'District 61', to: '/district/61' },
          { label: 'Clubs', to: '/district/61/clubs' },
          { label: 'Ottawa Club' },
        ]}
      />
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
