import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import DistrictChangesPage from '../DistrictChangesPage'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import { useSnapshotDiff } from '../../hooks/useSnapshotDiff'
import { useDistricts } from '../../hooks/useDistricts'
import type { SnapshotDiff } from '@taverns-red/shared-contracts'

vi.mock('../../hooks/useDistrictData')
vi.mock('../../hooks/useDistricts')
vi.mock('../../hooks/useSnapshotDiff', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useSnapshotDiff')
  >('../../hooks/useSnapshotDiff')
  return { ...actual, useSnapshotDiff: vi.fn() }
})

const mockedDates = vi.mocked(useDistrictCachedDates)
const mockedDiff = vi.mocked(useSnapshotDiff)
const mockedDistricts = vi.mocked(useDistricts)

function renderPage(initialEntry = '/district/61/changes') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/district/:districtId/changes"
          element={<DistrictChangesPage />}
        />
      </Routes>
    </MemoryRouter>
  )
}

const ag = (from: number, to: number) => ({ from, to, delta: to - from })

function diffFixture(over: Partial<SnapshotDiff> = {}): SnapshotDiff {
  return {
    districtId: '61',
    from: { date: '2026-05-25' },
    to: { date: '2026-05-26' },
    dayCount: 1,
    totals: {
      membership: ag(2716, 2742),
      payments: ag(5723, 5749),
      clubCount: ag(161, 162),
      distinguished: ag(49, 50),
    },
    clubs: { bothPresent: [], onlyInFrom: [], onlyInTo: [] },
    events: [
      {
        category: 'club-added',
        clubId: '28680300',
        clubName: 'iA Montreal Toastmasters',
        label: 'iA Montreal Toastmasters (Active) joined the roster',
        magnitude: 1,
      },
      {
        category: 'distinguished',
        clubId: '00002959',
        clubName: 'Club 00002959',
        label: 'Club 00002959 became Distinguished',
        magnitude: 1,
      },
      {
        category: 'division-status',
        clubId: '',
        clubName: '',
        divisionId: 'G',
        entityName: 'Division G',
        label: 'Division G moved to Select Distinguished',
        magnitude: 1,
      },
      {
        category: 'area-status',
        clubId: '',
        clubName: '',
        divisionId: 'B',
        areaId: '2',
        entityName: 'Area 2',
        label: 'Area 2 moved to Confirmed Distinguished',
        magnitude: 1,
      },
    ],
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedDistricts.mockReturnValue({
    data: { districts: [{ id: '61', name: '61' }] },
  } as unknown as ReturnType<typeof useDistricts>)
})

describe('DistrictChangesPage', () => {
  it('renders headline, four KPI cards, and grouped events for a real diff', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByTestId('changes-headline')).toHaveTextContent(
      /from May 25, 2026 to May 26, 2026/
    )
    expect(screen.getAllByTestId('kpi-delta-card')).toHaveLength(4)
    expect(screen.getByTestId('changes-list')).toBeInTheDocument()
    expect(screen.getByText(/Clubs that joined/)).toBeInTheDocument()
    // The club name is now a link to the club detail page (#1013); the prose
    // remainder of the roster-move label stays as plain text alongside it.
    expect(
      screen.getByRole('link', { name: 'iA Montreal Toastmasters' })
    ).toHaveAttribute('href', '/district/61/club/28680300')
    expect(screen.getByText(/\(Active\) joined the roster/)).toBeInTheDocument()
  })

  it('renders division and area status groups with entities linked to scoped routes (#1014)', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByText(/Division status changes/)).toBeInTheDocument()
    expect(screen.getByText(/Area status changes/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Division G' })).toHaveAttribute(
      'href',
      '/district/61/division/G'
    )
    expect(screen.getByRole('link', { name: 'Area 2' })).toHaveAttribute(
      'href',
      '/district/61/division/B/area/2'
    )
  })

  it('renders a Club status changes group adjacent to Clubs that joined, club name linked (#1247)', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture({
        events: [
          {
            category: 'club-added',
            clubId: '28680300',
            clubName: 'iA Montreal Toastmasters',
            label: 'iA Montreal Toastmasters (Active) joined the roster',
            magnitude: 1,
          },
          {
            category: 'club-status',
            clubId: '00001234',
            clubName: 'Health Canada Club',
            label: 'Health Canada Club became Active (was Low)',
            magnitude: 1,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    const { container } = renderPage()
    expect(screen.getByText(/Club status changes/)).toBeInTheDocument()
    // The club name links to its scoped route (ChangeLabel, #1013).
    expect(
      screen.getByRole('link', { name: 'Health Canada Club' })
    ).toHaveAttribute('href', '/district/61/club/00001234')
    expect(screen.getByText(/became Active \(was Low\)/)).toBeInTheDocument()

    // Adjacency (operator decision): the Club-status group renders immediately
    // after the Clubs-that-joined group, not folded into it.
    const headings = Array.from(
      container.querySelectorAll('details summary')
    ).map(s => s.textContent ?? '')
    const joined = headings.findIndex(h => /Clubs that joined/.test(h))
    const status = headings.findIndex(h => /Club status changes/.test(h))
    expect(joined).toBeGreaterThanOrEqual(0)
    expect(status).toBe(joined + 1)
  })

  it('renders the date-pair picker when at least two snapshots exist (#794)', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByTestId('changes-date-pair-picker')).toBeInTheDocument()
    expect(screen.getByTestId('changes-from-chip-select')).toHaveValue(
      '2026-05-25'
    )
    expect(screen.getByTestId('changes-to-chip-select')).toHaveValue(
      '2026-05-26'
    )
  })

  it('shows "Pick two different dates" when from === to (#794, R17)', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage('/district/61/changes?from=2026-05-26&to=2026-05-26')
    expect(screen.getByTestId('changes-same-date')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-headline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('changes-list')).not.toBeInTheDocument()
    // the picker stays visible so the user can correct the pair
    expect(screen.getByTestId('changes-date-pair-picker')).toBeInTheDocument()
  })

  it('shows a "from before to" message when from > to (#794, R17)', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage('/district/61/changes?from=2026-05-26&to=2026-05-25')
    expect(screen.getByTestId('changes-reversed')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-headline')).not.toBeInTheDocument()
    expect(screen.queryByTestId('changes-list')).not.toBeInTheDocument()
    expect(screen.getByTestId('changes-date-pair-picker')).toBeInTheDocument()
  })

  it('shows a "no recorded changes" message when the diff has no events', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture({ events: [] }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByTestId('changes-none')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-list')).not.toBeInTheDocument()
  })

  it('explains the disabled state when only one snapshot exists', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByTestId('changes-single')).toBeInTheDocument()
    expect(screen.queryByTestId('changes-headline')).not.toBeInTheDocument()
  })
})

// #980 — change-groups are open by default; a user's collapses persist in
// ?expandChanges (the value lists the COLLAPSED categories, so an all-default
// page keeps a clean URL). A shared/reloaded link restores those collapses.
describe('DistrictChangesPage — deep-linked group collapse (#980)', () => {
  let location = ''
  const LocationProbe: React.FC = () => {
    location = useLocation().search
    return null
  }
  function renderWithDiff(initialEntry: string) {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/district/:districtId/changes"
            element={<DistrictChangesPage />}
          />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    )
  }
  /** Find the <details> whose summary text matches. */
  const groupByHeading = (container: HTMLElement, re: RegExp) =>
    Array.from(container.querySelectorAll('details')).find(d =>
      d.querySelector('summary')?.textContent?.match(re)
    ) as HTMLDetailsElement | undefined

  it('opens every group by default (param absent)', () => {
    const { container } = renderWithDiff('/district/61/changes')
    expect(groupByHeading(container, /Clubs that joined/)?.open).toBe(true)
    expect(
      groupByHeading(container, /Distinguished status changes/)?.open
    ).toBe(true)
  })

  it('collapses only the categories named in ?expandChanges', () => {
    const { container } = renderWithDiff(
      '/district/61/changes?expandChanges=club-added'
    )
    expect(groupByHeading(container, /Clubs that joined/)?.open).toBe(false)
    expect(
      groupByHeading(container, /Distinguished status changes/)?.open
    ).toBe(true)
  })

  it('writes the category to ?expandChanges when a group is collapsed', () => {
    const { container } = renderWithDiff('/district/61/changes')
    const group = groupByHeading(container, /Clubs that joined/)!
    group.open = false
    fireEvent(group, new Event('toggle'))
    expect(new URLSearchParams(location).get('expandChanges')).toBe(
      'club-added'
    )
  })

  it('removes the category from ?expandChanges when a group is re-opened', () => {
    const { container } = renderWithDiff(
      '/district/61/changes?expandChanges=club-added'
    )
    const group = groupByHeading(container, /Clubs that joined/)!
    group.open = true
    fireEvent(group, new Event('toggle'))
    expect(new URLSearchParams(location).has('expandChanges')).toBe(false)
  })
})

/* District-realignment context (#1443). When the diffed pair straddles a
   district-composition discontinuity the page must SAY so — otherwise dozens
   of transferred clubs read as a dramatic month of roster churn — and the
   transfers must sit in their own groups so a genuine new club is not buried
   among them. */
describe('DistrictChangesPage — district realignment (#1443)', () => {
  const realignmentDiff = () =>
    diffFixture({
      from: { date: '2026-06-30' },
      to: { date: '2026-07-01' },
      rosterDiscontinuity: {
        kind: 'program-year-boundary',
        fromProgramYear: '2025-2026',
        toProgramYear: '2026-2027',
        clubsMovedIn: 12,
        clubsMovedOut: 10,
      },
      events: [
        {
          category: 'club-added',
          clubId: '111',
          clubName: 'Brand New Toastmasters',
          label: 'Brand New Toastmasters (Active) joined the roster',
          magnitude: 1,
        },
        {
          category: 'club-transferred-in',
          clubId: '222',
          clubName: 'Annexed Toastmasters',
          label:
            'Annexed Toastmasters (Active) moved into the district in the 2026 district realignment',
          magnitude: 1,
        },
        {
          category: 'club-transferred-out',
          clubId: '333',
          clubName: 'Departed Toastmasters',
          label:
            'Departed Toastmasters (Active) moved to another district in the 2026 district realignment',
          magnitude: -1,
        },
      ],
    })

  beforeEach(() => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-06-30', '2026-07-01'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
  })

  it('explains that the district boundaries changed, with the moved counts', () => {
    mockedDiff.mockReturnValue({
      data: realignmentDiff(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    const note = screen.getByTestId('changes-realignment')
    expect(note).toHaveTextContent(/boundaries changed/i)
    expect(note).toHaveTextContent(/12/)
    expect(note).toHaveTextContent(/10/)
    expect(note).toHaveTextContent(/2026-2027/)
  })

  it('groups transfers separately so a genuine new club is not buried in them', () => {
    mockedDiff.mockReturnValue({
      data: realignmentDiff(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByText(/Clubs moved in/)).toBeInTheDocument()
    expect(screen.getByText(/Clubs moved out/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Annexed Toastmasters' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Departed Toastmasters' })
    ).toBeInTheDocument()
    // The genuine charter keeps its own group and its roster wording.
    expect(screen.getByText(/Clubs that joined/)).toBeInTheDocument()
    expect(screen.getByText(/\(Active\) joined the roster/)).toBeInTheDocument()
  })

  it('says nothing about a realignment for an ordinary diff', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.queryByTestId('changes-realignment')).not.toBeInTheDocument()
    expect(screen.queryByText(/Clubs moved in/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Clubs moved out/)).not.toBeInTheDocument()
  })
})

/* #1462 (epic #1458 Sprint 4) — time-window preset chips.

   "What changed last week / last month / since July 1" used to mean scrolling a
   100+ entry dropdown twice. The chips resolve those windows against the dates
   the district actually RECORDED and write the resolved pair through the same
   ?from=&to= state, in ONE navigation — so a preset produces a shareable plain
   date-pair link and the back button still behaves. */
describe('DistrictChangesPage — time-window preset chips (#1462)', () => {
  // 05-26 latest; a week back lands on 05-19 exactly; a month back targets
  // 04-26 → nearest recorded at or before is 04-20; PY 2025-26 opens 2025-07-10.
  const HISTORY = [
    '2025-07-10',
    '2026-04-20',
    '2026-05-19',
    '2026-05-25',
    '2026-05-26',
  ]

  let location = ''
  const LocationProbe: React.FC = () => {
    location = useLocation().search
    return null
  }

  function renderWithHistory(
    initialEntry = '/district/61/changes',
    dates: string[] = HISTORY
  ) {
    mockedDates.mockReturnValue({
      data: { dates },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    // Echo the requested pair back, so the headline reflects the real selection
    // rather than a frozen fixture.
    mockedDiff.mockImplementation(
      (_districtId, from, to) =>
        ({
          data:
            from && to
              ? diffFixture({ from: { date: from }, to: { date: to } })
              : undefined,
          isLoading: false,
          isError: false,
        }) as unknown as ReturnType<typeof useSnapshotDiff>
    )
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/district/:districtId/changes"
            element={
              <>
                <LocationProbe />
                <DistrictChangesPage />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    )
  }

  it('renders the preset chips alongside the date-pair picker', () => {
    renderWithHistory()
    expect(screen.getByTestId('changes-preset-chips')).toBeInTheDocument()
    expect(screen.getByTestId('changes-date-pair-picker')).toBeInTheDocument()
    expect(screen.getByTestId('changes-preset-week')).toBeInTheDocument()
    expect(
      screen.getByTestId('changes-preset-program-year')
    ).toBeInTheDocument()
  })

  it('clicking "~1 month" resolves to recorded dates and re-renders the headline', () => {
    renderWithHistory()
    fireEvent.click(screen.getByTestId('changes-preset-month'))

    expect(location).toContain('from=2026-04-20')
    expect(screen.getByTestId('changes-headline')).toHaveTextContent(
      /from Apr 20, 2026 to May 26, 2026/
    )
  })

  it('clears a stale to= in the same navigation that writes from=', () => {
    // The failure shape this guards: writing only `from` would leave the old
    // `to=2026-05-19` in place and silently produce a pair nobody asked for.
    renderWithHistory('/district/61/changes?from=2025-07-10&to=2026-05-19')
    fireEvent.click(screen.getByTestId('changes-preset-month'))

    expect(location).toContain('from=2026-04-20')
    expect(location).not.toContain('to=2026-05-19')
    expect(screen.getByTestId('changes-headline')).toHaveTextContent(
      /from Apr 20, 2026 to May 26, 2026/
    )
  })

  it('deep-links as a plain date pair — no new URL param', () => {
    renderWithHistory()
    fireEvent.click(screen.getByTestId('changes-preset-program-year'))

    const params = new URLSearchParams(location)
    expect([...params.keys()].sort()).toEqual(['from'])
    expect(params.get('from')).toBe('2025-07-10')
  })

  it('keeps an unrelated deep-link param intact across a preset click', () => {
    renderWithHistory('/district/61/changes?expandChanges=membership')
    fireEvent.click(screen.getByTestId('changes-preset-week'))

    const params = new URLSearchParams(location)
    expect(params.get('expandChanges')).toBe('membership')
    expect(params.get('from')).toBe('2026-05-19')
  })

  it('never lands the page in an invalid pair state via a preset', () => {
    renderWithHistory()
    for (const id of ['week', 'month', 'program-year', 'last-snapshot']) {
      fireEvent.click(screen.getByTestId(`changes-preset-${id}`))
      expect(screen.queryByTestId('changes-same-date')).not.toBeInTheDocument()
      expect(screen.queryByTestId('changes-reversed')).not.toBeInTheDocument()
      expect(screen.getByTestId('changes-headline')).toBeInTheDocument()
    }
  })

  it('offers no chips when only one snapshot exists', () => {
    renderWithHistory('/district/61/changes', ['2026-05-26'])
    expect(screen.queryByTestId('changes-preset-chips')).not.toBeInTheDocument()
    expect(screen.getByTestId('changes-single')).toBeInTheDocument()
  })
})
