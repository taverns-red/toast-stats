import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import recorded from '../../../__tests__/fixtures/meeting-times-2026-10-19.recorded.json'
import { RollupMeetingHeatmap } from '../RollupMeetingHeatmap'
import {
  aggregateMeetingTimes,
  parseMeetingTimes,
  scopeMeetingTimes,
  type MeetingTimesScope,
  type MeetingTimesView,
} from '../../../utils/meetingTimesRollup'
import type {
  MeetingMode,
  MeetingSelection,
} from '../../../utils/meetingHeatmap'

/* #1814 — the region and world meeting-time heatmap body, on the pipeline's
   own meeting-times.json for 2026-10-19 (recorded prod inputs). */

const view = parseMeetingTimes(recorded) as MeetingTimesView

function renderBody(
  opts: {
    scope?: MeetingTimesScope
    mode?: MeetingMode
    selection?: MeetingSelection | null
    url?: string
    v?: MeetingTimesView
  } = {}
) {
  const scope = opts.scope ?? { kind: 'region', regionId: '05' }
  const scoped = scopeMeetingTimes(opts.v ?? view, scope)
  return render(
    <MemoryRouter
      initialEntries={[opts.url ?? '/region/05/meetings?date=2026-10-19']}
    >
      <RollupMeetingHeatmap
        scoped={scoped}
        unreadable={(opts.v ?? view).unreadable}
        mode={opts.mode ?? 'all'}
        selection={opts.selection ?? null}
      />
    </MemoryRouter>
  )
}

const grid = () =>
  screen.getByRole('group', { name: /clubs by weekday and start hour/i })

describe('RollupMeetingHeatmap', () => {
  it('the district page’s 7 × 24 grid, summed over the region', () => {
    renderBody()
    const cells = within(grid()).getAllByTestId('meeting-cell')
    expect(cells).toHaveLength(7 * 24)
    const sum = aggregateMeetingTimes(
      scopeMeetingTimes(view, { kind: 'region', regionId: '05' }).districts,
      'all'
    )
    const n = sum.counts[2]![19]!
    expect(
      within(grid()).getByRole('link', {
        name: `Wednesday 19:00–19:59: ${n} clubs`,
      })
    ).toHaveAttribute('href', expect.stringContaining('slot=wed-19'))
    // The page's date stays on the link (URL state, R3).
    expect(
      within(grid()).getByRole('link', {
        name: `Wednesday 19:00–19:59: ${n} clubs`,
      })
    ).toHaveAttribute('href', expect.stringContaining('date=2026-10-19'))
  })

  it('states local time: hours are each club’s own clock', () => {
    renderBody()
    expect(screen.getByTestId('meetings-time-basis')).toHaveTextContent(
      /local time/i
    )
  })

  it('KPIs count the unscheduled clubs, never drop them', () => {
    renderBody()
    const kpis = screen.getByRole('list', { name: /meetings at a glance/i })
    const clubs = 198 + 154 + 105 + 161 + 101 + 111 + 142
    const scheduled = 193 + 145 + 102 + 158 + 94 + 107 + 137
    expect(kpis).toHaveTextContent(
      `${scheduled.toLocaleString()} of ${clubs.toLocaleString()}`
    )
    expect(kpis).toHaveTextContent(
      new RegExp(`Schedule not stated\\s*${clubs - scheduled}`)
    )
  })

  it('the mode switch is links, URL-synced', () => {
    renderBody({ mode: 'online', url: '/region/05/meetings?mode=online' })
    const nav = screen.getByRole('navigation', { name: /how clubs meet/i })
    expect(within(nav).getByRole('link', { name: 'Online' })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('a selected cell lists the districts in it, busiest first, linking down with the cell', () => {
    renderBody({
      selection: { day: 'Wednesday', hour: 19 },
      mode: 'online',
      url: '/region/05/meetings?mode=online&slot=wed-19&date=2026-10-19',
    })
    const panel = screen.getByRole('region', { name: /wednesday 19:00/i })
    const link = within(panel).getByRole('link', { name: /District 61/ })
    const href = new URL(link.getAttribute('href')!, 'https://x')
    expect(href.pathname).toBe('/district/61/meetings')
    expect(href.searchParams.get('slot')).toBe('wed-19')
    expect(href.searchParams.get('mode')).toBe('online')
    expect(href.searchParams.get('date')).toBe('2026-10-19')
  })

  it('a breakdown table has one row per district with its counts', () => {
    renderBody()
    const table = screen.getByRole('table', { name: /by district/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(7)
    const d61 = rows.find(r => /District 61/.test(r.textContent ?? ''))!
    expect(
      within(d61)
        .getAllByRole('cell')
        .map(c => c.textContent)
    ).toEqual(['161', '158', '111', '67'])
  })

  it('the region filters by district: a select of its districts', () => {
    renderBody({
      scope: { kind: 'region', regionId: '05', district: '61' },
      url: '/region/05/meetings?district=61',
    })
    const select = screen.getByRole('combobox', { name: /district/i })
    expect(select).toHaveValue('61')
    expect(
      within(select)
        .getAllByRole('option')
        .map(o => o.textContent)
    ).toEqual([
      'All districts',
      'District 31',
      'District 53',
      'District 60',
      'District 61',
      'District 86',
      'District 123',
      'District 216',
    ])
    expect(
      screen.getByRole('list', { name: /at a glance/i })
    ).toHaveTextContent('158 of 161')
  })

  it('the world breaks down by region and filters by region', () => {
    renderBody({ scope: { kind: 'world' }, url: '/regions/meetings' })
    const table = screen.getByRole('table', { name: /by region/i })
    expect(
      within(table).getByRole('link', { name: 'Region 05' })
    ).toHaveAttribute('href', expect.stringContaining('/region/05/meetings'))
    expect(table).toHaveTextContent('Not in a region')
    expect(screen.getByRole('combobox', { name: /region/i })).toHaveValue('')
  })

  it('names a district whose counts could not be read', () => {
    const bad = structuredClone(recorded)
    bad.districts['53'].modes.all.noTime = [1]
    renderBody({ v: parseMeetingTimes(bad)! })
    expect(screen.getByTestId('meetings-unreadable')).toHaveTextContent(
      /District 53/
    )
  })

  it('uses no raw colour: intensity is a class, never an inline colour', () => {
    const { container } = renderBody()
    for (const el of container.querySelectorAll('[style]'))
      expect(el.getAttribute('style')).not.toMatch(/#|rgb|hsl|color/i)
  })
})
