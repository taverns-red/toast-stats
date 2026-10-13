/**
 * Membership-trend sparkline column on the district Clubs table (#1792,
 * epic #1781; mobile epic #1827 §6.5).
 *
 * The page already loads `analytics.allClubs[].membershipTrend` (the PYTD
 * daily series, 57 points for D61 on 2026-10-11) — the sparkline reads that,
 * adds no fetch. Contract:
 * - a "Trend" column right after Members, at every width tier (core column);
 * - a 60×16 inline SVG whose accessible name carries base → current and the
 *   signed net change (Lesson 102: a signed delta, never a clamped gap);
 * - sortable by net change, clubs without a base sort last in both directions;
 * - below 768 the row list carries the same sparkline as the row's trend, and
 *   the Filter & sort sheet offers "Net change".
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render as rtlRender,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { ClubsTable } from '../ClubsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { processClubs } from '../../utils/columnFilterUtils'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const series = (...counts: number[]) =>
  counts.map((count, i) => ({
    date: `2026-07-${String(26 + i).padStart(2, '0')}`,
    count,
  }))

const club = (
  id: string,
  name: string,
  overrides: Partial<ClubTrend> = {}
): ClubTrend => ({
  clubId: id,
  clubName: name,
  divisionId: 'A',
  divisionName: 'Division A',
  areaId: 'A1',
  areaName: 'Area A1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipBase: 18,
  membershipTrend: series(18, 19, 20),
  dcpGoalsTrend: [{ date: '2026-07-28', goalsAchieved: 5 }],
  ...overrides,
})

const CLUBS: ClubTrend[] = [
  club('1', 'Alpha Speakers'), // +2
  club('2', 'Bravo Talkers', {
    membershipBase: 20,
    membershipTrend: series(20, 17, 15), // −5
  }),
  club('3', 'Charlie Orators', {
    membershipBase: 10,
    membershipTrend: series(10, 12, 16), // +6
  }),
  club('4', 'Delta Debaters', {
    membershipBase: undefined, // no base → no net
    membershipTrend: series(9, 9, 9),
  }),
]

function stubMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const rowNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('#clubs-table tbody tr')).map(
    tr => tr.querySelector('.clubs-name-link')?.textContent
  )

describe('processClubs netChange (#1792)', () => {
  it('is the signed latest − base, null without a base', () => {
    const [a, b, , d] = processClubs(CLUBS)
    expect(a).toMatchObject({ netChange: 2 })
    expect(b).toMatchObject({ netChange: -5 })
    expect(d).toMatchObject({ netChange: null })
  })
})

describe('ClubsTable ≥ 768 — Trend column (#1792)', () => {
  it('renders a Trend header right after Members', () => {
    const { container } = render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const headers = Array.from(
      container.querySelectorAll(
        '#clubs-table thead th .clubs-col-header span.flex-1'
      )
    ).map(el => el.textContent?.trim())
    expect(headers.indexOf('Trend')).toBe(headers.indexOf('Members') + 1)
  })

  it('draws a 60×16 sparkline per row named with base → current and net', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const alpha = screen.getByRole('img', {
      name: 'Membership 18 → 20 this program year, net +2',
    })
    expect(alpha.tagName.toLowerCase()).toBe('svg')
    expect(alpha).toHaveAttribute('viewBox', '0 0 60 16')
    expect(
      screen.getByRole('img', {
        name: 'Membership 20 → 15 this program year, net −5',
      })
    ).toBeInTheDocument()
    // No base: no invented delta.
    expect(
      screen.getByRole('img', { name: 'Membership now 9, no base recorded' })
    ).toBeInTheDocument()
  })

  it('shows the signed net beside the sparkline as text, not colour alone', () => {
    const { container } = render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const nets = Array.from(
      container.querySelectorAll('#clubs-table tbody .clubs-trend-cell__net')
    ).map(el => el.textContent)
    // Default name sort: Alpha, Bravo, Charlie, Delta.
    expect(nets).toEqual(['+2', '−5', '+6', '—'])
  })

  it('a flat series (range 0) sits on the midline, never inverted', () => {
    render(<ClubsTable clubs={CLUBS} districtId="61" />)
    const flat = screen.getByRole('img', {
      name: 'Membership now 9, no base recorded',
    })
    const ys = flat
      .querySelector('polyline')!
      .getAttribute('points')!
      .split(' ')
      .map(p => Number(p.split(',')[1]))
    expect(new Set(ys)).toEqual(new Set([8]))
  })

  it('starts the line at the base, so its shape agrees with the net', () => {
    // TI's July counts restart below the PY base, so a series alone can
    // rise while the club is down on its base — the line would contradict
    // the net printed beside it. Anchoring the first point at the base keeps
    // shape and number telling the same story.
    render(
      <ClubsTable
        clubs={[
          club('9', 'Echo Club', {
            membershipBase: 26,
            membershipTrend: series(16, 17, 18), // rising series, net −8
          }),
        ]}
        districtId="61"
      />
    )
    const svg = screen.getByRole('img', {
      name: 'Membership 26 → 18 this program year, net −8',
    })
    const ys = svg
      .querySelector('polyline')!
      .getAttribute('points')!
      .split(' ')
      .map(p => Number(p.split(',')[1]))
    // Four points (base + 3); the first (26, the max) is the highest point.
    expect(ys).toHaveLength(4)
    expect(Math.min(...ys)).toBe(ys[0])
  })

  it('sorts by net change from the Trend header, no-base clubs last', () => {
    const onSortChange = vi.fn()
    const { container } = render(
      <ClubsTable clubs={CLUBS} districtId="61" onSortChange={onSortChange} />
    )
    fireEvent.click(screen.getByRole('button', { name: /sort by trend/i }))
    expect(onSortChange).toHaveBeenLastCalledWith('netChange', 'asc')
    expect(rowNames(container)).toEqual([
      'Bravo Talkers',
      'Alpha Speakers',
      'Charlie Orators',
      'Delta Debaters',
    ])
    fireEvent.click(screen.getByRole('button', { name: /sort by trend/i }))
    expect(rowNames(container)).toEqual([
      'Charlie Orators',
      'Alpha Speakers',
      'Bravo Talkers',
      'Delta Debaters',
    ])
  })

  it('restores a net-change sort from the URL', () => {
    const { container } = render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        initialSortField="netChange"
        initialSortDirection="desc"
      />
    )
    expect(rowNames(container)[0]).toBe('Charlie Orators')
  })
})

describe('ClubsTable < 768 — row sparkline (#1792)', () => {
  it('every phone row carries the trend sparkline and the net in its name', () => {
    stubMobile(true)
    render(
      <ClubsTable
        clubs={CLUBS}
        districtId="61"
        openGroups={['A']}
        onOpenGroupsChange={vi.fn()}
      />
    )
    const rows = screen.getAllByTestId('mobile-row')
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      const trailing = row.querySelector('.mobile-row__trailing')
      expect(trailing?.querySelector('svg')).toHaveAttribute(
        'viewBox',
        '0 0 60 16'
      )
    }
    expect(rows[0]).toHaveAccessibleName(/net \+2/)
    // Members and net sit under the sparkline ("20 (+2)"), so line 2 keeps
    // its full width for the chip and DCP at 375 (measured: with the count
    // on line 2 every D61 row ellipsized by up to 60 px).
    const trend = rows[0]!.querySelector('.clubs-row-trend__net')
    expect(trend).toHaveTextContent('20 (+2)')
    expect(rows[3]!.querySelector('.clubs-row-trend__net')).toHaveTextContent(
      /^9$/
    )
  })

  it('offers "Net change" in the Filter & sort sheet', () => {
    stubMobile(true)
    const onSortChange = vi.fn()
    render(
      <ClubsTable clubs={CLUBS} districtId="61" onSortChange={onSortChange} />
    )
    fireEvent.click(screen.getByRole('button', { name: /filter & sort/i }))
    const select = screen.getByLabelText('Sort by')
    expect(
      within(select).getByRole('option', { name: 'Net change' })
    ).toHaveValue('netChange')
    fireEvent.change(select, { target: { value: 'netChange' } })
    expect(onSortChange).toHaveBeenCalledWith('netChange', 'asc')
  })
})
