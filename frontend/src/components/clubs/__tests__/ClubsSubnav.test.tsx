import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  within,
  cleanup,
  fireEvent,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ClubsSubnav } from '../ClubsSubnav'
import { PHONE_SECTION_BAR_QUERY } from '../../../config/districtSections'

/**
 * #1556 — the `/clubs` lateral section nav mirrors `DistrictSubnav`
 * (ADR-005 §3): a `nav` landmark with its own label, every item a REAL
 * route, `aria-current="page"` on the active one only.
 */
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ClubsSubnav />
    </MemoryRouter>
  )

describe('ClubsSubnav (#1556)', () => {
  it('is a labelled nav landmark listing Overview and the four tier races', () => {
    renderAt('/clubs')
    const nav = screen.getByRole('navigation', {
      name: 'Clubs worldwide sections',
    })
    const links = within(nav).getAllByRole('link')
    expect(links.map(l => l.textContent)).toEqual([
      'Overview',
      'Distinguished',
      'Select',
      "President's",
      'Smedley',
    ])
    expect(links.map(l => l.getAttribute('href'))).toEqual([
      '/clubs',
      '/clubs/race/distinguished',
      '/clubs/race/select',
      '/clubs/race/presidents',
      '/clubs/race/smedley',
    ])
  })

  it('marks only the active route with aria-current', () => {
    renderAt('/clubs/race/select')
    const nav = screen.getByRole('navigation', {
      name: 'Clubs worldwide sections',
    })
    const current = within(nav)
      .getAllByRole('link')
      .filter(l => l.getAttribute('aria-current') === 'page')
    expect(current.map(l => l.textContent)).toEqual(['Select'])
  })

  it('Overview is active only at the exact hub URL', () => {
    renderAt('/clubs/race/smedley')
    const overview = screen.getByRole('link', { name: 'Overview' })
    expect(overview.getAttribute('aria-current')).toBeNull()
  })
})

/* #1832 — on a phone held upright, clubs-world gets the bottom section bar:
   3 routes + More (the remaining tier races), via the shared SectionBar.
   One landmark in the DOM; landscape and >=768 keep the scroll-row. */
describe('ClubsSubnav on a phone (#1832)', () => {
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

  it('renders the bottom bar: Overview · Distinguished · Select · More', () => {
    stubViewport(true)
    renderAt('/clubs')
    const navs = screen.getAllByRole('navigation', {
      name: 'Clubs worldwide sections',
    })
    expect(navs).toHaveLength(1)
    expect(navs[0]).toHaveAttribute('data-testid', 'clubs-section-bar')
    expect(screen.queryByTestId('clubs-subnav')).not.toBeInTheDocument()
    expect(
      within(navs[0]!)
        .getAllByRole('link')
        .map(a => [a.textContent, a.getAttribute('href')])
    ).toEqual([
      ['Overview', '/clubs'],
      ['Distinguished', '/clubs/race/distinguished'],
      ['Select', '/clubs/race/select'],
    ])
    expect(screen.getByRole('button', { name: /^More/ })).toBeInTheDocument()
  })

  it('More holds the other races, and carries the active state on one of them', () => {
    stubViewport(true)
    renderAt('/clubs/race/smedley')
    const more = screen.getByRole('button', { name: /^More/ })
    expect(more).toHaveAccessibleName('More sections, current: Smedley')
    fireEvent.click(more)
    const sheet = screen.getByRole('dialog', { name: 'More sections' })
    expect(
      within(sheet)
        .getAllByRole('link')
        .map(a => [a.textContent, a.getAttribute('href')])
    ).toEqual([
      ["President's", '/clubs/race/presidents'],
      ['Smedley', '/clubs/race/smedley'],
    ])
  })

  it('keeps the scroll-row on landscape phones and >=768', () => {
    stubViewport(false)
    renderAt('/clubs')
    expect(screen.getByTestId('clubs-subnav')).toBeInTheDocument()
    expect(screen.queryByTestId('clubs-section-bar')).not.toBeInTheDocument()
  })
})
