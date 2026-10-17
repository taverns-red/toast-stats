import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { SectionBar, type SectionBarItem } from '../SectionBar'

expect.extend(toHaveNoViolations)

/* #1832 (mobile epic #1827 Phase 1) — the phone's bottom section bar.
   4 primary routes + a "More" button that opens the shared BottomSheet
   (#1831) with the rest. Every item is a NavLink to a REAL route (ADR-005):
   no tabs, the back button and deep links are unchanged. */

afterEach(cleanup)

const icon = <svg data-testid="icon" />
const PRIMARY: SectionBarItem[] = [
  { label: 'Overview', to: '/d', end: true, icon },
  { label: 'Clubs', to: '/d/clubs', icon },
  { label: 'Divisions', to: '/d/divisions', icon },
  { label: 'Trends', to: '/d/trends', icon },
]
const MORE: SectionBarItem[] = [
  { label: 'What Changed', to: '/d/changes' },
  { label: 'Rankings', to: '/d/rankings' },
]

const Where = () => (
  <output data-testid="where">{useLocation().pathname}</output>
)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SectionBar
        label="District sections"
        primary={PRIMARY}
        more={MORE}
        testId="section-bar"
      />
      <Where />
    </MemoryRouter>
  )

const bar = () => screen.getByRole('navigation', { name: 'District sections' })
const moreButton = () => screen.getByRole('button', { name: /^More/ })

describe('SectionBar (#1832)', () => {
  it('omits More (and its sheet) when there is nothing in it (#1815)', () => {
    render(
      <MemoryRouter initialEntries={['/regions']}>
        <SectionBar
          label="Regions sections"
          primary={[
            { label: 'Rankings', to: '/regions', end: true, icon },
            { label: 'Health & compliance', to: '/regions/health', icon },
          ]}
          more={[]}
        />
      </MemoryRouter>
    )
    const nav = screen.getByRole('navigation', { name: 'Regions sections' })
    expect(nav.querySelectorAll('a')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^More/ })).toBeNull()
  })

  it('is a labelled nav landmark with 4 route links and a More button', () => {
    renderAt('/d')
    const nav = bar()
    expect(nav).toHaveClass('section-bar')
    expect(nav).toHaveAttribute('data-testid', 'section-bar')
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map(a => a.textContent)).toEqual([
      'Overview',
      'Clubs',
      'Divisions',
      'Trends',
    ])
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/d',
      '/d/clubs',
      '/d/divisions',
      '/d/trends',
    ])
    // Every item shows an icon AND a text label.
    expect(nav.querySelectorAll('[data-testid="icon"]')).toHaveLength(4)
    // More is the last item, after the routes (keyboard order = visual order).
    const items = Array.from(nav.querySelectorAll('a, button'))
    expect(items[items.length - 1]).toBe(moreButton())
  })

  it('each label carries its own text in data-label (the bold-width reserve)', () => {
    renderAt('/d')
    const labels = Array.from(bar().querySelectorAll('.section-bar__label'))
    expect(labels.map(l => l.getAttribute('data-label'))).toEqual([
      'Overview',
      'Clubs',
      'Divisions',
      'Trends',
      'More',
    ])
    expect(labels.map(l => l.textContent)).toEqual(
      labels.map(l => l.getAttribute('data-label'))
    )
  })

  it('marks the active primary route with aria-current="page" (end on the hub)', () => {
    renderAt('/d/divisions')
    expect(screen.getByRole('link', { name: 'Divisions' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current'
    )
    expect(moreButton()).not.toHaveAttribute('data-active')
  })

  it('More opens a dialog sheet with the remaining sections as links', () => {
    renderAt('/d')
    expect(moreButton()).toHaveAttribute('aria-haspopup', 'dialog')
    expect(moreButton()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(moreButton())
    expect(moreButton()).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: 'More sections' })
    expect(moreButton()).toHaveAttribute('aria-controls', sheet.id)
    const links = Array.from(sheet.querySelectorAll('a'))
    expect(links.map(a => [a.textContent, a.getAttribute('href')])).toEqual([
      ['What Changed', '/d/changes'],
      ['Rankings', '/d/rankings'],
    ])
  })

  it('reaches a More section in two taps, as a real route change, and closes the sheet', () => {
    renderAt('/d')
    fireEvent.click(moreButton())
    fireEvent.click(screen.getByRole('link', { name: 'Rankings' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/d/rankings')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('on a More route, More carries the active state and names the current section', () => {
    renderAt('/d/rankings')
    expect(moreButton()).toHaveAttribute('data-active', 'true')
    expect(moreButton()).toHaveAccessibleName(
      'More sections, current: Rankings'
    )
    // No primary link claims the page.
    for (const p of PRIMARY) {
      expect(screen.getByRole('link', { name: p.label })).not.toHaveAttribute(
        'aria-current'
      )
    }
    fireEvent.click(moreButton())
    expect(
      screen.getByRole('dialog').querySelector('a[aria-current="page"]')
    ).toHaveTextContent('Rankings')
  })

  it('has no axe violations, closed and open', async () => {
    const { container } = renderAt('/d/clubs')
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(moreButton())
    expect(await axe(document.body)).toHaveNoViolations()
  })
})
