/**
 * LandingSearch (#2249) — the landing hero's "find anything" form. It is the
 * SAME engine as the header combobox and the Cmd-K palette (useOmniSearch +
 * OmniSearchResults), presented as a large, visibly labelled field.
 *
 * Enter: a single exact match navigates; anything else keeps the list open.
 * The index is fetched lazily, on focus, never at mount.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LandingSearch } from '../LandingSearch'
import * as searchIndex from '../../services/searchIndex'

vi.mock('../../services/cdnClosedClubNames', () => ({
  fetchClosedClubNames: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../hooks/clubDistrictHistoryQuery', () => ({
  clubDistrictHistoryShardQuery: () => ({
    queryKey: ['shard', 'none'],
    queryFn: async () => null,
  }),
}))

const INDEX: searchIndex.SearchIndex = {
  entities: [
    {
      type: 'district',
      id: '61',
      label: 'District 61',
      route: '/district/61',
      terms: ['61', 'district 61'],
    },
    {
      type: 'district',
      id: '6',
      label: 'District 6',
      route: '/district/6',
      terms: ['6', 'district 6'],
    },
    {
      type: 'club',
      id: '00001234',
      label: 'Toast of the Town',
      context: 'District 61',
      route: '/district/61/club/00001234',
      terms: ['00001234', 'toast of the town'],
    },
    // Real-shape collisions (review B1): old clubs carry low numbers, so
    // Club 61 shares its number with District 61, and regions 1–14 share
    // theirs with districts 1–14.
    {
      type: 'club',
      id: '61',
      label: 'Boise Club',
      context: 'District 207',
      route: '/district/207/club/61',
      terms: ['61', 'boise club'],
    },
    {
      type: 'region',
      id: '06',
      label: 'Region 6',
      route: '/region/06',
      terms: ['06', '6', 'region 6'],
    },
    {
      type: 'page',
      id: '/methodology',
      label: 'Methodology',
      route: '/methodology',
      terms: ['methodology'],
    },
  ],
}

const Location: React.FC = () => {
  const { pathname } = useLocation()
  return <span data-testid="location">{pathname}</span>
}

function renderSearch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LandingSearch />
                <Location />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const input = () =>
  screen.getByRole('combobox', { name: /find a district, club or region/i })

describe('LandingSearch (#2249)', () => {
  let load: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    load = vi.spyOn(searchIndex, 'loadSearchIndex').mockResolvedValue(INDEX)
  })

  it('is a visibly labelled combobox and fetches nothing until focused', () => {
    renderSearch()
    expect(input()).toBeInTheDocument()
    expect(screen.getByText(/find a district, club or region/i).tagName).toBe(
      'LABEL'
    )
    expect(load).not.toHaveBeenCalled()
    fireEvent.focus(input())
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('shows grouped results, with site pages, for a query', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'method' } })
    const listbox = await screen.findByRole('listbox')
    expect(listbox).toHaveTextContent('Methodology')
    expect(input()).toHaveAttribute('aria-expanded', 'true')
  })

  it('Enter on a district number goes to that district, even when a club shares the number (B1)', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: '61' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/district/61')
    )
  })

  it('Enter on a district number beats a region with the same number (B1)', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: '6' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/district/6')
    )
  })

  it('Enter on a single exact match navigates', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'region 6' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/region/06')
    )
  })

  it('Enter without an exact match keeps the list open instead of guessing', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'distr' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(screen.getByTestId('location')).toHaveTextContent('/')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    // Arrow + Enter still chooses the highlighted row (the shared contract).
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/district/')
    )
  })

  it('exposes a stable focus target for the "/" shortcut', () => {
    const ref = React.createRef<HTMLInputElement>()
    const client = new QueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LandingSearch inputRef={ref} />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(ref.current).toBe(input())
  })
})

describe('LandingSearch — keyboard and failure states (#2250 review)', () => {
  let load: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    load = vi.spyOn(searchIndex, 'loadSearchIndex').mockResolvedValue(INDEX)
  })

  it('says so and offers Retry when the index fails to load, then recovers', async () => {
    load.mockRejectedValueOnce(new Error('cdn down'))
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'dis' } })
    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(screen.getByRole('status')).toHaveTextContent(/could not load/i)
    fireEvent.click(retry)
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('announces "Searching…" and "No matches." in a live region', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'zzz' } })
    const status = await screen.findByRole('status')
    await waitFor(() => expect(status).toHaveTextContent(/no matches/i))
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('Escape closes the list and keeps focus; a second Escape clears the text', async () => {
    renderSearch()
    input().focus()
    fireEvent.change(input(), { target: { value: 'dis' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(input())
    expect(input()).toHaveValue('dis')
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(input()).toHaveValue('')
    expect(document.activeElement).toBe(input())
  })

  it('typing after Escape reopens the list', async () => {
    renderSearch()
    input().focus()
    fireEvent.change(input(), { target: { value: 'dis' } })
    await screen.findByRole('listbox')
    fireEvent.keyDown(input(), { key: 'Escape' })
    fireEvent.change(input(), { target: { value: 'dist' } })
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('ArrowDown moves aria-activedescendant to the next option', async () => {
    renderSearch()
    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: 'district' } })
    const list = await screen.findByRole('listbox')
    const options = within(list).getAllByRole('option')
    expect(input()).toHaveAttribute('aria-activedescendant', options[0]!.id)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    expect(input()).toHaveAttribute('aria-activedescendant', options[1]!.id)
  })
})
