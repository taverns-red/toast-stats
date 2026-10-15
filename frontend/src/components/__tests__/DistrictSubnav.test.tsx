import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { DistrictSubnav } from '../DistrictSubnav'
import {
  DISTRICT_SECTIONS,
  PHONE_SECTION_BAR_QUERY,
} from '../../config/districtSections'

expect.extend(toHaveNoViolations)

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DistrictSubnav districtId="61" />
    </MemoryRouter>
  )

describe('DistrictSubnav (#678, ADR-005 §3)', () => {
  it('renders a nav labelled "District sections" — distinct from the breadcrumb', () => {
    renderAt('/district/61')
    expect(
      screen.getByRole('navigation', { name: 'District sections' })
    ).toBeInTheDocument()
    // It is NOT the breadcrumb affordance.
    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' })
    ).not.toBeInTheDocument()
  })

  it('renders one link per live section with the right hrefs', () => {
    renderAt('/district/61')
    const expected: Record<string, string> = {
      Overview: '/district/61',
      'What Changed': '/district/61/changes',
      Clubs: '/district/61/clubs',
      Divisions: '/district/61/divisions',
      Trends: '/district/61/trends',
      Analytics: '/district/61/analytics',
      Rankings: '/district/61/rankings',
      'Action List': '/district/61/action-list',
    }
    for (const [label, href] of Object.entries(expected)) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'href',
        href
      )
    }
  })

  it('lists Trends and Analytics now that their routes exist (#680)', () => {
    renderAt('/district/61')
    expect(screen.getByRole('link', { name: 'Trends' })).toHaveAttribute(
      'href',
      '/district/61/trends'
    )
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute(
      'href',
      '/district/61/analytics'
    )
    // ADR-005 §3 order: lateral views read Overview · What Changed · Clubs ·
    // Divisions · Grid · Map · Trends · Analytics · Rankings. Grid (#1230) sits
    // after Divisions as the dense whole-district companion to the division
    // breakdown; Map (#1784) follows it, the same view laid out geographically.
    // Action List (#1231) closes the epic as the area-director "what to do
    // next" destination — last, since it's a task view, not a lateral data view.
    // Growth (#1794), the Club Growth funnel, follows Map; Education (#1793)
    // follows Growth, the last whole-district view before the time series;
    // Survival (#1817), charter cohort survival, follows Education.
    expect(DISTRICT_SECTIONS.map(s => s.label)).toEqual([
      'Overview',
      'What Changed',
      'Clubs',
      'Divisions',
      'Grid',
      'Map',
      'Growth',
      'Education',
      'Survival',
      'Trends',
      'Analytics',
      'Rankings',
      'Action List',
    ])
  })

  it('marks Trends active on the trends route (#680)', () => {
    renderAt('/district/61/trends')
    expect(screen.getByRole('link', { name: 'Trends' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('marks the active route with aria-current="page" (Clubs)', () => {
    renderAt('/district/61/clubs')
    expect(screen.getByRole('link', { name: 'Clubs' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByRole('link', { name: 'Divisions' })).not.toHaveAttribute(
      'aria-current'
    )
  })

  it('marks Overview active only at the exact hub, not on sub-routes (end match)', () => {
    renderAt('/district/61')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('does NOT mark Overview active when on a sub-route', () => {
    renderAt('/district/61/divisions')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute(
      'aria-current'
    )
    expect(screen.getByRole('link', { name: 'Divisions' })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('has no axe violations', async () => {
    const { container } = renderAt('/district/61/clubs')
    expect(await axe(container)).toHaveNoViolations()
  })
})

/* #1832 — below 768 in portrait the top scroll-row gives way to the bottom
   section bar: 4 primary routes + More (the rest, in the shared sheet). The
   switch is a media query in JS so only ONE "District sections" landmark is
   ever in the DOM. Landscape phones and >=768 keep the #1849 scroll-row. */
describe('DistrictSubnav on a phone (#1832)', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const stubViewport = (phone: boolean) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: phone && query === PHONE_SECTION_BAR_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    )
  }

  it('the phone query is portrait and below 768 only', () => {
    expect(PHONE_SECTION_BAR_QUERY).toBe(
      '(max-width: 767px) and (orientation: portrait)'
    )
  })

  it('renders the bottom bar, not the scroll-row: Overview · Clubs · Divisions · Trends · More', () => {
    stubViewport(true)
    renderAt('/district/61')
    const navs = screen.getAllByRole('navigation', {
      name: 'District sections',
    })
    expect(navs).toHaveLength(1)
    expect(navs[0]).toHaveAttribute('data-testid', 'district-section-bar')
    expect(screen.queryByTestId('district-subnav')).not.toBeInTheDocument()
    expect(
      Array.from(navs[0]!.querySelectorAll('a')).map(a => a.textContent)
    ).toEqual(['Overview', 'Clubs', 'Divisions', 'Trends'])
    expect(screen.getByRole('button', { name: /^More/ })).toBeInTheDocument()
  })

  it('More holds every other section, in config order, so all 12 are within 2 taps', () => {
    stubViewport(true)
    renderAt('/district/61')
    fireEvent.click(screen.getByRole('button', { name: /^More/ }))
    const sheet = screen.getByRole('dialog', { name: 'More sections' })
    expect(
      Array.from(sheet.querySelectorAll('a')).map(a => [
        a.textContent,
        a.getAttribute('href'),
      ])
    ).toEqual([
      ['What Changed', '/district/61/changes'],
      ['Grid', '/district/61/grid'],
      ['Map', '/district/61/map'],
      ['Growth', '/district/61/growth'],
      ['Education', '/district/61/education'],
      ['Survival', '/district/61/survival'],
      ['Analytics', '/district/61/analytics'],
      ['Rankings', '/district/61/rankings'],
      ['Action List', '/district/61/action-list'],
    ])
  })

  it('keeps the scroll-row on landscape phones and >=768', () => {
    stubViewport(false)
    renderAt('/district/61')
    expect(screen.getByTestId('district-subnav')).toBeInTheDocument()
    expect(screen.queryByTestId('district-section-bar')).not.toBeInTheDocument()
  })
})
