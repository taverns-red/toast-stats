/**
 * Clubs table states and export (#2676, spec §7 and §9; test plan 7 and 9).
 *
 * - Loading: a skeleton sized to the columns the table will show at this
 *   width, from the same sizes as the colgroup, so nothing shifts on load.
 * - Empty: honest copy. "No clubs recorded" (no data for the date) is not "no
 *   clubs match your filters" (a way out: Clear all filters). Neither says
 *   "cached".
 * - Caption date: the table says which date its data is FROM.
 * - Export: every column, the rows the user sees, in the order they see them.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  render as rtlRender,
  cleanup,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ClubsTable } from '../ClubsTable'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { columnMeta, tierDefaults } from '../clubsColumnMeta'
import { stubViewportWidth } from '../../test-utils/viewportMatchMedia'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter })

const makeClub = (over: Partial<ClubTrend> = {}): ClubTrend => ({
  clubId: 'c1',
  clubName: 'Alpha Club',
  divisionId: 'div-1',
  divisionName: 'A',
  areaId: 'area-1',
  areaName: '1',
  distinguishedLevel: 'NotDistinguished',
  currentStatus: 'thriving',
  riskFactors: [],
  membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 20 }],
  dcpGoalsTrend: [{ date: '2026-03-01T00:00:00.000Z', goalsAchieved: 5 }],
  ...over,
})

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('loading skeleton is sized to the columns (#2676, spec §7)', () => {
  const skeleton = () => screen.getByTestId('clubs-table-skeleton')
  const cols = () => Array.from(skeleton().querySelectorAll('col'))

  it.each([768, 1024, 1280, 1600] as const)(
    'at %ipx it has one column per visible column, with their widths',
    width => {
      stubViewportWidth(width)
      render(<ClubsTable clubs={[]} districtId="61" isLoading />)
      const tier =
        width >= 1600
          ? 'wide'
          : width >= 1280
            ? 'desktop'
            : width >= 1024
              ? 'laptop'
              : 'tablet'
      const defaults = tierDefaults(tier)
      const shown = Object.keys(columnMeta).filter(
        id => defaults[id] && !id.startsWith('delta')
      )
      expect(cols()).toHaveLength(shown.length)
      // Fixed columns carry their width; Club takes the rest (no width).
      const fixed = cols()
        .map(c => c.style.width)
        .filter(Boolean)
        .map(w => Number.parseInt(w, 10))
      expect(fixed.reduce((a, b) => a + b, 0)).toBe(
        shown
          .filter(id => id !== 'name')
          .reduce((sum, id) => sum + columnMeta[id].size, 0)
      )
    }
  )

  it('reserves the header row and ten body rows at the row height', () => {
    stubViewportWidth(1280)
    render(<ClubsTable clubs={[]} districtId="61" isLoading />)
    expect(skeleton().querySelectorAll('thead th').length).toBeGreaterThan(0)
    expect(skeleton().querySelectorAll('tbody tr')).toHaveLength(10)
  })

  it('is announced once as a status, and does not claim zero clubs', () => {
    stubViewportWidth(1280)
    render(<ClubsTable clubs={[]} districtId="61" isLoading />)
    expect(
      screen.getByRole('status', { name: /loading table/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/total: 0 clubs/i)).toBeNull()
    expect(screen.queryByText(/no clubs/i)).toBeNull()
  })
})

describe('empty states (#2676, spec §7)', () => {
  it('says no clubs were recorded for the date, with no "cached" wording', () => {
    render(<ClubsTable clubs={[]} districtId="61" dataDate="2026-11-11" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(
      'No clubs recorded for District 61 on Nov 11, 2026.'
    )
    expect(document.body.textContent).not.toMatch(/cached/i)
    // It is not the filters' fault: no Clear action.
    expect(screen.queryByRole('button', { name: /clear all filters/i })).toBe(
      null
    )
  })

  it('names no date when the table has none', () => {
    render(<ClubsTable clubs={[]} districtId="61" />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'No clubs recorded for District 61.'
    )
  })

  it('offers Clear all filters when a text filter excludes every club', () => {
    render(
      <ClubsTable
        clubs={[makeClub()]}
        districtId="61"
        initialFilterState={{
          name: {
            field: 'name',
            type: 'text',
            value: 'zzz',
            operator: 'contains',
          },
        }}
      />
    )
    expect(screen.getByText('No clubs match your filters')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /clear all filters/i })
    ).toBeVisible()
    expect(screen.queryByText(/no clubs recorded/i)).toBeNull()
  })

  it('offers Clear all filters when the preset excludes every club, and clears it', async () => {
    const onPresetChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ClubsTable
        clubs={[
          makeClub({
            membershipTrend: [{ date: '2026-03-01T00:00:00.000Z', count: 5 }],
            dcpGoalsTrend: [
              { date: '2026-03-01T00:00:00.000Z', goalsAchieved: 0 },
            ],
          }),
        ]}
        districtId="61"
        initialPresetActive
        onPresetChange={onPresetChange}
      />
    )
    expect(screen.getByText('No clubs match your filters')).toBeVisible()
    // The preset is named, so the user knows what is excluding the clubs.
    expect(
      screen.getByText(/Active:.*Close to Distinguished/, { selector: 'p' })
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: /clear all filters/i }))
    expect(onPresetChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByText('No clubs match your filters')).toBeNull()
    expect(screen.getByText('Alpha Club')).toBeVisible()
  })
})

describe('"Clubs as of" date (#2676, spec §7)', () => {
  it('shows the date the data is from, next to the count', () => {
    render(
      <ClubsTable clubs={[makeClub()]} districtId="61" dataDate="2026-11-11" />
    )
    expect(screen.getByText('Clubs as of Nov 11, 2026')).toBeVisible()
  })

  it('shows no date line without a date', () => {
    render(<ClubsTable clubs={[makeClub()]} districtId="61" />)
    expect(screen.queryByText(/clubs as of/i)).toBeNull()
  })
})

describe('CSV export (#2676, spec §9)', () => {
  let captured: string | null

  beforeEach(() => {
    captured = null
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const RealBlob = globalThis.Blob
    vi.stubGlobal(
      'Blob',
      class MockBlob extends RealBlob {
        constructor(
          parts?: ConstructorParameters<typeof Blob>[0],
          options?: ConstructorParameters<typeof Blob>[1]
        ) {
          super(parts, options)
          if (parts && parts.length > 0) captured = String(parts[0])
        }
      }
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined
    )
  })

  const csv = () => {
    expect(captured).not.toBeNull()
    const lines = captured!.split('\n')
    return {
      headers: lines[4].split(','),
      rows: lines
        .slice(5)
        .filter(l => l.trim())
        .map(l => l.split(',')),
    }
  }

  const clubs = [
    makeClub({ clubId: '1', clubName: 'Bravo', divisionName: 'B' }),
    makeClub({
      clubId: '2',
      clubName: 'Alpha',
      divisionName: 'A',
      distinguishedLevel: 'Select',
      isProvisionallyDistinguished: true,
    }),
    makeClub({
      clubId: '3',
      clubName: 'Charlie',
      divisionName: 'C',
      distinguishedLevel: 'Select',
      isProvisionallyDistinguished: false,
    }),
  ]

  it('labels the button so the scope is clear', () => {
    render(<ClubsTable clubs={clubs} districtId="61" />)
    expect(
      screen.getByRole('button', { name: /^Export CSV \(all columns\)/ })
    ).toBeEnabled()
    expect(screen.queryByRole('button', { name: /^Export Clubs/ })).toBeNull()
  })

  it('exports columns the table is hiding, with the table-only fields', async () => {
    // At 768 Division, Years and Trend are off by default.
    stubViewportWidth(768)
    const user = userEvent.setup()
    render(<ClubsTable clubs={clubs} districtId="61" />)
    expect(screen.queryByRole('columnheader', { name: /^Div/ })).toBeNull()
    await user.click(
      screen.getByRole('button', { name: /^Export CSV \(all columns\)/ })
    )
    await waitFor(() => expect(captured).not.toBeNull())
    const { headers, rows } = csv()
    expect(headers).toEqual(
      expect.arrayContaining([
        'Division',
        'Area',
        'Coach',
        'Members Base',
        'Members Needed',
        'Net Change',
        'Years Chartered',
        'Distinguished Confirmed',
      ])
    )
    const division = headers.indexOf('Division')
    expect(rows.map(r => r[division]).sort()).toEqual(['A', 'B', 'C'])
    const confirmed = headers.indexOf('Distinguished Confirmed')
    const name = headers.indexOf('Club Name')
    const byName = Object.fromEntries(rows.map(r => [r[name], r[confirmed]]))
    // Alpha is Select but provisional; Bravo has no tier; Charlie is confirmed.
    expect(byName).toEqual({ Alpha: 'No', Bravo: 'No', Charlie: 'Yes' })
  })

  it('exports the filtered rows in the sorted order', async () => {
    const user = userEvent.setup()
    render(
      <ClubsTable
        clubs={clubs}
        districtId="61"
        initialSortField="name"
        initialSortDirection="desc"
        initialFilterState={{
          name: {
            field: 'name',
            type: 'text',
            value: 'r',
            operator: 'contains',
          },
        }}
      />
    )
    await user.click(
      screen.getByRole('button', { name: /^Export CSV \(all columns\)/ })
    )
    await waitFor(() => expect(captured).not.toBeNull())
    const { headers, rows } = csv()
    // "r" matches Bravo and Charlie, not Alpha; descending by name.
    expect(rows.map(r => r[headers.indexOf('Club Name')])).toEqual([
      'Charlie',
      'Bravo',
    ])
  })
})
