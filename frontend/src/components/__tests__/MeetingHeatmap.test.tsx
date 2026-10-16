import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fixture from '../../__tests__/fixtures/meeting-schedule-d61-2026-10-15.json'
import { MeetingHeatmap } from '../MeetingHeatmap'
import {
  buildMeetingHeatmap,
  clubsInSlot,
  type MeetingClub,
  type MeetingMode,
  type MeetingSelection,
} from '../../utils/meetingHeatmap'

/* #1796 — the district meeting-time heatmap body, on the real D61
   2026-10-15 schedules. */

const clubs = fixture.clubs as MeetingClub[]

function renderHeatmap(
  opts: {
    mode?: MeetingMode
    selection?: MeetingSelection | null
    search?: string
  } = {}
) {
  return render(
    <MemoryRouter
      initialEntries={[`/district/61/meetings${opts.search ?? ''}`]}
    >
      <MeetingHeatmap
        clubs={clubs}
        districtId="61"
        mode={opts.mode ?? 'all'}
        selection={opts.selection ?? null}
        mapContext={{ py: '2026', date: '2026-10-15' }}
      />
    </MemoryRouter>
  )
}

describe('MeetingHeatmap', () => {
  it('a 7 × 24 grid of cells, each with a screen-reader value', () => {
    renderHeatmap()
    const grid = screen.getByRole('group', {
      name: /clubs by weekday and start hour/i,
    })
    const cells = within(grid).getAllByTestId('meeting-cell')
    expect(cells).toHaveLength(7 * 24)
    const wed19 = clubsInSlot(clubs, { day: 'Wednesday', hour: 19 }, 'all')
    expect(
      within(grid).getByRole('link', {
        name: `Wednesday 19:00–19:59: ${wed19.length} clubs`,
      })
    ).toHaveAttribute('href', expect.stringContaining('slot=wed-19'))
  })

  it('an empty cell is not a link but still says "no clubs"', () => {
    renderHeatmap()
    const grid = screen.getByRole('group', {
      name: /clubs by weekday and start hour/i,
    })
    const empty = within(grid).getByLabelText('Monday 03:00–03:59: no clubs')
    expect(empty.tagName).not.toBe('A')
  })

  it('the mode switch is links, URL-synced, the current one marked', () => {
    renderHeatmap({ mode: 'online', search: '?mode=online' })
    const nav = screen.getByRole('navigation', { name: /how clubs meet/i })
    const current = within(nav).getByRole('link', { name: 'Online' })
    expect(current).toHaveAttribute('aria-current', 'true')
    expect(
      within(nav).getByRole('link', { name: 'In person' })
    ).toHaveAttribute('href', expect.stringContaining('mode=in-person'))
    expect(
      within(nav).getByRole('link', { name: 'All meetings' })
    ).not.toHaveAttribute('href', expect.stringContaining('mode='))
  })

  it('states the unknown-schedule clubs as a count, never drops them', () => {
    renderHeatmap()
    const kpis = screen.getByRole('list', { name: /meetings at a glance/i })
    expect(kpis).toHaveTextContent('158 of 161')
    expect(
      within(kpis).getByRole('link', { name: /3 clubs.*schedule not stated/i })
    ).toHaveAttribute('href', expect.stringContaining('slot=unknown'))
  })

  it('a selected cell lists its clubs and links to the map, filtered', () => {
    const slot = { day: 'Wednesday', hour: 19 } as const
    renderHeatmap({ selection: slot, mode: 'online' })
    const listed = clubsInSlot(clubs, slot, 'online')
    const panel = screen.getByRole('region', { name: /wednesday 19:00/i })
    expect(within(panel).getAllByRole('listitem')).toHaveLength(listed.length)
    const map = within(panel).getByRole('link', { name: /show on the map/i })
    const href = new URL(map.getAttribute('href')!, 'https://x')
    expect(href.pathname).toBe('/district/61/map')
    expect(href.searchParams.get('meets')).toBe('wed-19-online')
    expect(href.searchParams.get('py')).toBe('2026')
    expect(href.searchParams.get('date')).toBe('2026-10-15')
    const first = listed[0]!
    expect(
      within(panel).getByRole('link', { name: first.clubName })
    ).toHaveAttribute('href', `/district/61/club/${first.clubId}`)
  })

  it('the unknown selection lists the clubs with no parsed schedule', () => {
    renderHeatmap({ selection: 'unknown' })
    const panel = screen.getByRole('region', { name: /schedule not stated/i })
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3)
  })

  it('a data table alternative carries every count', () => {
    renderHeatmap({ mode: 'in-person' })
    const table = screen.getByRole('table', {
      name: /clubs by start hour and weekday/i,
    })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(1 + 24)
    const map = buildMeetingHeatmap(clubs, 'in-person')
    const row19 = rows[1 + 19]!
    const cells = within(row19).getAllByRole('cell')
    expect(cells.map(c => Number(c.textContent))).toEqual(
      map.counts.map(day => day[19])
    )
  })

  it('names the evenings no club starts in', () => {
    renderHeatmap()
    const gaps = buildMeetingHeatmap(clubs, 'all').eveningGaps
    const note = screen.getByTestId('meeting-evening-gaps')
    if (gaps.length === 0) expect(note).toHaveTextContent(/every evening/i)
    else for (const d of gaps) expect(note).toHaveTextContent(d)
  })

  it('uses no raw colour: intensity is a class, never an inline colour', () => {
    const { container } = renderHeatmap()
    for (const el of container.querySelectorAll('[style]'))
      expect(el.getAttribute('style')).not.toMatch(/#|rgb|hsl|color/i)
  })
})
