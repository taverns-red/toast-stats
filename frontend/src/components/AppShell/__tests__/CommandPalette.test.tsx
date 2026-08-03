/* CommandPalette (#422 → omni-search epic #1055 Sprint 2, #1057) — scoped
   tests on the palette component directly (Lesson 51 — keep render scope
   tight). Sprint 2 swaps the districts-only data layer for the unified
   Sprint-1 search index (districts + regions + clubs), grouped by type. */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import CommandPalette from '../CommandPalette'

// The palette now loads the unified index, which fans out to three CDN
// fetches (rankings → districts+regions, club-index → clubs,
// divisions-areas-index → divisions+areas, #1135). Mock all three.
const fetchCdnRankings = vi.fn()
const fetchCdnClubIndex = vi.fn()
const fetchCdnDivisionsAreasIndex = vi.fn()
// #1403 — districts come from the union of the current roster and the
// historical snapshot index; a harness that omits this stub breaks the loader.
const fetchCdnSnapshotIndex = vi.fn()

vi.mock('../../../services/cdn', () => ({
  fetchCdnRankings: (...args: unknown[]) => fetchCdnRankings(...args),
  fetchCdnClubIndex: (...args: unknown[]) => fetchCdnClubIndex(...args),
  fetchCdnDivisionsAreasIndex: (...args: unknown[]) =>
    fetchCdnDivisionsAreasIndex(...args),
  fetchCdnSnapshotIndex: (...args: unknown[]) => fetchCdnSnapshotIndex(...args),
}))

const rankingRow = (
  districtId: string,
  districtName: string,
  region: string
) => ({ districtId, districtName, region })

const setupCdn = (
  opts: {
    rankings?: Array<ReturnType<typeof rankingRow>>
    clubs?: Record<string, { districtId: string; clubName: string }>
    divisionsAreas?: Record<string, Record<string, string[]>>
    snapshotIndex?: Record<string, string[]>
  } = {}
) => {
  fetchCdnSnapshotIndex.mockResolvedValue(
    opts.snapshotIndex ?? { '57': ['2025-11-22'], '61': ['2025-11-22'] }
  )
  fetchCdnRankings.mockResolvedValue({
    rankings: opts.rankings ?? [
      rankingRow('57', 'District 57', '7'),
      rankingRow('61', 'District 61', '7'),
    ],
    asOfDate: '2025-11-22',
  })
  fetchCdnClubIndex.mockResolvedValue({
    clubs: opts.clubs ?? {
      '12345': { districtId: '61', clubName: 'Toast of the Town' },
    },
  })
  fetchCdnDivisionsAreasIndex.mockResolvedValue({
    generatedAt: '2026-06-10T00:00:00Z',
    snapshotDate: '2026-06-09',
    totalDivisions: 1,
    totalAreas: 1,
    districts: opts.divisionsAreas ?? { '61': { C: ['23'] } },
  })
}

const renderPalette = (isOpen: boolean) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CommandPalette isOpen={isOpen} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CommandPalette omni-search (#1057)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupCdn()
  })

  it('renders nothing when closed', () => {
    renderPalette(false)
    expect(
      screen.queryByRole('dialog', { name: /universal search/i })
    ).not.toBeInTheDocument()
  })

  it('does not fetch the club index until the palette is opened (lazy)', () => {
    renderPalette(false)
    expect(fetchCdnClubIndex).not.toHaveBeenCalled()
    expect(fetchCdnRankings).not.toHaveBeenCalled()
  })

  it('renders an input + dialog when open', async () => {
    renderPalette(true)
    expect(
      screen.getByRole('dialog', { name: /universal search/i })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/universal search input/i)).toBeInTheDocument()
    // Loading the index fans out to both CDN fetches on open.
    await vi.waitFor(() => expect(fetchCdnClubIndex).toHaveBeenCalled())
    expect(fetchCdnRankings).toHaveBeenCalled()
  })

  it('finds a district and navigates to /district/<id> (no #422 regression)', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: '61' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const districts = within(listbox).getByRole('group', { name: /districts/i })
    const link = within(districts).getByRole('link')
    expect(link).toHaveTextContent(/District 61/)
    expect(link.getAttribute('href')).toBe('/district/61')
  })

  // --- districts that no longer exist (#1403) ---

  it('finds a consolidated district and lands it on its last snapshot, flagged as no longer active', async () => {
    // D27 is absent from the current roster but has 151 snapshots ending
    // 2026-06-30 — searching it must not look the same as searching D999.
    setupCdn({
      rankings: [rankingRow('61', 'District 61', '7')],
      snapshotIndex: {
        '61': ['2026-07-31'],
        '27': ['2025-06-30', '2026-06-30'],
      },
    })
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: '27' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const districts = await within(listbox).findByRole('group', {
      name: /districts/i,
    })
    const link = within(districts).getByRole('link')
    expect(link).toHaveTextContent(/D27/)
    // The treatment: the muted context slot clubs/regions already use, saying
    // when the district's data stops. No new chrome.
    expect(link).toHaveTextContent(/Last active 2026-06-30/)
    // ...and the link lands on a page with real data, not an empty current year.
    expect(link.getAttribute('href')).toBe(
      '/district/27?py=2025&date=2026-06-30'
    )
  })

  it('leaves a live district row untouched — no last-active note', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: '61' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const districts = within(listbox).getByRole('group', { name: /districts/i })
    const link = within(districts).getByRole('link')
    expect(link).not.toHaveTextContent(/last active/i)
    expect(link.getAttribute('href')).toBe('/district/61')
  })

  it('finds a club, shows it under a Clubs group with its district, and routes to the club', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: 'Toast' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const clubs = await within(listbox).findByRole('group', {
      name: /clubs/i,
    })
    const link = within(clubs).getByRole('link')
    expect(link).toHaveTextContent(/Toast of the Town/)
    // Disambiguation context (which district the club belongs to).
    expect(link).toHaveTextContent(/District 61/)
    expect(link.getAttribute('href')).toBe('/district/61/club/12345')
  })

  it('finds a region and routes to /region/<n>', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: 'Region 7' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const regions = await within(listbox).findByRole('group', {
      name: /regions/i,
    })
    const link = within(regions).getByRole('link')
    expect(link).toHaveTextContent(/Region 7/)
    expect(link.getAttribute('href')).toBe('/region/7')
  })

  it('groups results by type with headings when a query spans entities', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    // "61" matches District 61; widen with a query the club also matches.
    fireEvent.change(input, { target: { value: 'o' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    // At least the Clubs group is present (club name contains "o").
    await within(listbox).findByRole('group', { name: /clubs/i })
  })

  it('finds a division ("61 c") under a Divisions group and routes to the scoped division page (#1135)', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: '61 c' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const divisions = await within(listbox).findByRole('group', {
      name: /divisions/i,
    })
    const link = within(divisions).getByRole('link')
    expect(link).toHaveTextContent(/Division C/)
    // Disambiguation context (which district the division belongs to).
    expect(link).toHaveTextContent(/District 61/)
    // Route-keyed (Lesson 152): the stable identifier, not a CDN label.
    expect(link.getAttribute('href')).toBe('/district/61/division/C')
  })

  it('finds an area ("area 23 61") under an Areas group and routes to the nested area page (#1135)', async () => {
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: 'area 23 61' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    const areas = await within(listbox).findByRole('group', {
      name: /areas/i,
    })
    const link = within(areas).getByRole('link')
    expect(link).toHaveTextContent(/Area 23/)
    expect(link).toHaveTextContent(/District 61 · Division C/)
    expect(link.getAttribute('href')).toBe('/district/61/division/C/area/23')
  })

  it('shows an empty-state prompt before the user types', async () => {
    renderPalette(true)
    // No query yet → no listbox, a guiding prompt instead.
    expect(
      screen.queryByRole('listbox', { name: /search results/i })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/type to search/i)).toBeInTheDocument()
  })

  it('does not duplicate the district number when districtName is bare (#522)', async () => {
    setupCdn({ rankings: [rankingRow('86', '86', '6')], clubs: {} })
    renderPalette(true)
    const input = screen.getByLabelText(/universal search input/i)
    fireEvent.change(input, { target: { value: '86' } })

    const listbox = await screen.findByRole('listbox', {
      name: /search results/i,
    })
    expect(within(listbox).getByText('D86')).toBeInTheDocument()
    expect(within(listbox).queryByText(/^86$/)).not.toBeInTheDocument()
  })
})
