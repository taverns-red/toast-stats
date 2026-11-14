import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import DistrictChangesPage from '../DistrictChangesPage'
import { PROVISIONAL_NOTE } from '../../components/DistinguishedCount'
import { useDistrictCachedDates } from '../../hooks/useDistrictData'
import {
  useSnapshotDiff,
  type SnapshotDiffView,
} from '../../hooks/useSnapshotDiff'
import { useDistricts } from '../../hooks/useDistricts'
import type { SnapshotDiff } from '@taverns-red/shared-contracts'
import { exportSnapshotDiff } from '../../utils/csvExport'
import { useTransferCounterparts } from '../../hooks/useTransferCounterparts'
import { useDistrictRanking } from '../../hooks/useDistrictRanking'
import { useDistinguishedCountsAt } from '../../hooks/useDistinguishedCountsAt'

vi.mock('../../utils/csvExport', () => ({ exportSnapshotDiff: vi.fn() }))
vi.mock('../../hooks/useDistrictData')
vi.mock('../../hooks/useDistricts')
// The confirmed Distinguished count (#2438) is read from the dated rankings
// row; a seam here, with no row unless a test names one.
vi.mock('../../hooks/useDistrictRanking', () => ({
  useDistrictRanking: vi.fn(),
}))
const mockedRanking = vi.mocked(useDistrictRanking)
// The per-date analytics `distinguishedCounts` (#2601); a seam, null unless a
// test names a pair.
vi.mock('../../hooks/useDistinguishedCountsAt', () => ({
  useDistinguishedCountsAt: vi.fn(),
}))
const mockedCounts = vi.mocked(useDistinguishedCountsAt)
vi.mock('../../hooks/useSnapshotDiff', async () => {
  const actual = await vi.importActual<
    typeof import('../../hooks/useSnapshotDiff')
  >('../../hooks/useSnapshotDiff')
  return { ...actual, useSnapshotDiff: vi.fn() }
})

// The club-district history join (#1806) is unit-tested in its own hook test;
// here it is a seam, empty unless a test names a counterpart.
vi.mock('../../hooks/useTransferCounterparts', () => ({
  useTransferCounterparts: vi.fn(),
}))
const mockedCounterparts = vi.mocked(useTransferCounterparts)
const noCounterparts = (
  over: Partial<ReturnType<typeof useTransferCounterparts>> = {}
): ReturnType<typeof useTransferCounterparts> => ({
  counterparts: new Map(),
  deferred: new Set(),
  loadMore: vi.fn(),
  ...over,
})

const mockedDates = vi.mocked(useDistrictCachedDates)
const mockedDiff = vi.mocked(useSnapshotDiff)
// The page may hand the diff hook a revision point (#2475); these tests pass
// plain dates, so echo the date.
const dateOf = (p: string | { date: string }) =>
  typeof p === 'string' ? p : p.date
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

function diffFixture(over: Partial<SnapshotDiffView> = {}): SnapshotDiffView {
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
  mockedCounterparts.mockReturnValue(noCounterparts())
  mockedRanking.mockReturnValue({ ranking: null, isLoading: false })
  mockedCounts.mockReturnValue({ counts: null, isLoading: false })
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

  // #2646 (HUB-07): the section bar sat at six heights across tabs. This page
  // used its own header and a 48px "District 61" breadcrumb under an h1 that
  // already says it. It now carries the shared section header (title + lede)
  // and no breadcrumb; the Overview tab is the way back. The pixel proof is
  // e2e/district-subnav-position.smoke.ts.
  it('uses the shared district section header and no breadcrumb (#2646)', () => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    const { container } = renderPage()
    expect(screen.queryByTestId('subpage-breadcrumb')).toBeNull()
    expect(
      container.querySelector('.district-detail-page-header h1')
    ).not.toBeNull()
    expect(screen.getByTestId('district-detail-lede')).toHaveTextContent(
      /changes between two dates/i
    )
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

  /* The notice asserts something about the district's boundaries that the
     reader cannot check from the page. #1470 widened when it fires, so it now
     has to say where the rule is written down (#1400 rule-change log). */
  it('points at the rule-change log entry that says how a realignment is detected', () => {
    mockedDiff.mockReturnValue({
      data: realignmentDiff(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    const link = within(screen.getByTestId('changes-realignment')).getByRole(
      'link',
      { name: /how a realignment is detected/i }
    )
    expect(link).toHaveAttribute(
      'href',
      '/methodology#py-2026-2027-district-boundaries-redrawn'
    )
  })

  it('names the district on the other side of each transfer the history knows (#1806)', () => {
    const diff = realignmentDiff()
    mockedDiff.mockReturnValue({
      data: diff,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)
    mockedCounterparts.mockReturnValue(
      noCounterparts({ counterparts: new Map([['333', '201']]) })
    )

    renderPage()
    // The page hands the hook the diff it renders and its route district (R3).
    expect(mockedCounterparts).toHaveBeenCalledWith(diff, '61')
    expect(screen.getByRole('link', { name: 'District 201' })).toHaveAttribute(
      'href',
      '/district/201'
    )
    expect(screen.getByText(/transferred to/)).toBeInTheDocument()
    // The club the history cannot place keeps the engine's wording.
    expect(screen.getByText(/moved into the district/)).toBeInTheDocument()
  })

  it('offers the next batch of counterparts for rows outside the loaded budget (#2063)', () => {
    mockedDiff.mockReturnValue({
      data: realignmentDiff(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)
    const loadMore = vi.fn()
    mockedCounterparts.mockReturnValue(
      noCounterparts({ deferred: new Set(['222']), loadMore })
    )

    renderPage()
    const button = screen.getByRole('button', {
      name: 'Name the other district for 1 more club',
    })
    fireEvent.click(button)
    expect(loadMore).toHaveBeenCalledTimes(1)
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

/* Payment changes group (#1459, epic #1458 Sprint 1).

   CATEGORY_GROUPS is an explicit display list: a category it does not name is
   dropped SILENTLY — no error, no fallback group, the events simply never
   render. So a new engine category is only half-shipped until this list names
   it, and that half is exactly the half a test catches. */
describe('DistrictChangesPage — payment changes (#1459)', () => {
  beforeEach(() => {
    mockedDistricts.mockReturnValue({
      data: { districts: [{ id: '61', name: '61' }] },
    } as unknown as ReturnType<typeof useDistricts>)
    mockedDates.mockReturnValue({
      data: { dates: ['2026-07-31', '2026-08-30'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
  })

  it('renders a Payment changes group with the type breakdown', () => {
    mockedDiff.mockReturnValue({
      data: diffFixture({
        events: [
          {
            category: 'payments',
            clubId: '00003045',
            clubName: 'Limestone City Club',
            label:
              'Limestone City Club recorded 4 new payments ' +
              '(2 October renewals, 1 new member, 1 other)',
            magnitude: 4,
          },
          // Neighbours on both sides, so the ordering assertion below has
          // something to be ordered against (an empty group renders nothing).
          {
            category: 'membership',
            clubId: '00002959',
            clubName: 'Bytown Club',
            label: 'Bytown Club gained 3 members',
            magnitude: 3,
          },
          {
            category: 'dcp-goals',
            clubId: '00002960',
            clubName: 'Rideau Club',
            label: 'Rideau Club met 1 more DCP goal',
            magnitude: 1,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    const { container } = renderPage()

    expect(screen.getByText(/Payment changes/)).toBeInTheDocument()
    expect(
      screen.getByText(/recorded 4 new payments \(2 October renewals/)
    ).toBeInTheDocument()
    // The club name links to its scoped route, like every other club event.
    expect(
      screen.getByRole('link', { name: 'Limestone City Club' })
    ).toHaveAttribute('href', '/district/61/club/00003045')

    // Payments sits with the per-club metric churn, between membership and
    // DCP — asserted as ORDER, not mere presence.
    const headings = Array.from(
      container.querySelectorAll('details summary')
    ).map(s => s.textContent ?? '')
    const membership = headings.findIndex(h => /Membership changes/.test(h))
    const payments = headings.findIndex(h => /Payment changes/.test(h))
    const dcp = headings.findIndex(h => /DCP goal changes/.test(h))
    expect(membership).toBeGreaterThanOrEqual(0)
    expect(payments).toBe(membership + 1)
    expect(dcp).toBe(payments + 1)
  })

  it('renders no Payment changes group when there are no payments events', () => {
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.queryByText(/Payment changes/)).not.toBeInTheDocument()
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
              ? diffFixture({
                  from: { date: dateOf(from) },
                  to: { date: dateOf(to) },
                })
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

/* Club Success Plan submissions group (#1460, epic #1458 Sprint 2).

   CATEGORY_GROUPS is an explicit ordered display list, and a category it does
   not name is dropped SILENTLY — no error, no fallback bucket, the events just
   never reach the DOM. The engine half of a new category can therefore be
   fully green while the feature ships invisible; this is the test that catches
   the missing half. */
describe('DistrictChangesPage — Club Success Plan submissions (#1460)', () => {
  beforeEach(() => {
    mockedDistricts.mockReturnValue({
      data: { districts: [{ id: '61', name: '61' }] },
    } as unknown as ReturnType<typeof useDistricts>)
    mockedDates.mockReturnValue({
      data: { dates: ['2026-07-31', '2026-08-30'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
  })

  it('renders a Club Success Plan submissions group in the recognition band', () => {
    mockedDiff.mockReturnValue({
      data: diffFixture({
        events: [
          {
            category: 'csp',
            clubId: '00003045',
            clubName: 'Limestone City Club',
            label: 'Limestone City Club submitted its Club Success Plan',
            magnitude: 1,
          },
          // Neighbours on both sides so the ordering assertion has something to
          // be ordered against (an empty group renders nothing).
          {
            category: 'distinguished',
            clubId: '00002959',
            clubName: 'Bytown Club',
            label: 'Bytown Club became Distinguished',
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
        ],
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    const { container } = renderPage()

    expect(
      screen.getByText(/Club Success Plan submissions/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/submitted its Club Success Plan/)
    ).toBeInTheDocument()
    // The club name links to its scoped route, like every other club event.
    expect(
      screen.getByRole('link', { name: 'Limestone City Club' })
    ).toHaveAttribute('href', '/district/61/club/00003045')

    // CSP sits in the recognition band: after club distinguished, before the
    // division/area status groups — asserted as ORDER, not mere presence.
    const headings = Array.from(
      container.querySelectorAll('details summary')
    ).map(s => s.textContent ?? '')
    const distinguished = headings.findIndex(h =>
      /Distinguished status changes/.test(h)
    )
    const csp = headings.findIndex(h => /Club Success Plan submissions/.test(h))
    const division = headings.findIndex(h => /Division status changes/.test(h))
    expect(distinguished).toBeGreaterThanOrEqual(0)
    expect(csp).toBe(distinguished + 1)
    expect(division).toBe(csp + 1)
  })

  it('renders no Club Success Plan group when there are no csp events', () => {
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(
      screen.queryByText(/Club Success Plan submissions/)
    ).not.toBeInTheDocument()
  })
})

/* #1461 (epic #1458 Sprint 3) — export parity. Every other data-heavy surface
   offers CSV; this page had no affordance at all. The exporter already exists
   (`exportSnapshotDiff`, wired into ClubsTable) — this mounts the existing
   ExportButton onto it rather than growing a second one. */
describe('DistrictChangesPage — CSV export (#1461)', () => {
  const mockedExport = vi.mocked(exportSnapshotDiff)

  const twoDates = () =>
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)

  const exportButton = () =>
    screen.queryByRole('button', { name: /Export CSV/i })

  it('offers an export button once a diff is loaded, and exports that diff', () => {
    twoDates()
    const diff = diffFixture()
    mockedDiff.mockReturnValue({
      data: diff,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    const button = exportButton()
    expect(button).toBeInTheDocument()
    fireEvent.click(button!)
    // The loaded diff itself — so the CSV covers the SAME date pair the
    // headline names, not a re-derived one (R3).
    expect(mockedExport).toHaveBeenCalledWith(diff)
  })

  it('offers no export while the diff is loading', () => {
    twoDates()
    mockedDiff.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(exportButton()).not.toBeInTheDocument()
  })

  it('offers no export when the diff failed to load', () => {
    twoDates()
    mockedDiff.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByTestId('changes-error')).toBeInTheDocument()
    expect(exportButton()).not.toBeInTheDocument()
  })

  it('offers no export when only one snapshot has been recorded', () => {
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
    expect(exportButton()).not.toBeInTheDocument()
  })

  it('offers no export for an invalid pair, even with a stale diff cached', () => {
    twoDates()
    mockedDiff.mockReturnValue({
      data: diffFixture(),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage('/district/61/changes?from=2026-05-26&to=2026-05-26')
    expect(screen.getByTestId('changes-same-date')).toBeInTheDocument()
    expect(exportButton()).not.toBeInTheDocument()
  })

  it('offers no export when there is nothing to export', () => {
    twoDates()
    mockedDiff.mockReturnValue({
      data: diffFixture({
        events: [],
        clubs: { bothPresent: [], onlyInFrom: [], onlyInTo: [] },
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)

    renderPage()
    expect(screen.getByTestId('changes-none')).toBeInTheDocument()
    expect(exportButton()).not.toBeInTheDocument()
  })
})

/* #1463 (epic #1458 Sprint 5) — the net reaches the real page, not just the
   isolated component. The page already hands ChangeGroup both the category and
   the events, so the net is derived from the rows actually on screen; this
   proves the wiring end-to-end and pins the category gate at page level. */
describe('DistrictChangesPage net-delta headings (#1463)', () => {
  const withEvents = (events: SnapshotDiff['events']) => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture({ events }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)
    renderPage()
  }

  it('shows the membership net summed from the events the group renders', () => {
    withEvents([
      {
        category: 'membership',
        clubId: '1',
        clubName: 'Alpha Club',
        label: 'Alpha Club gained 9 members',
        magnitude: 9,
      },
      {
        category: 'membership',
        clubId: '2',
        clubName: 'Beta Club',
        label: 'Beta Club lost 4 members',
        magnitude: -4,
      },
    ])

    const nets = screen.getAllByTestId('changes-group-net')
    expect(nets).toHaveLength(1)
    expect(nets[0]).toHaveTextContent(/net \+5\b/)
    expect(nets[0]).toHaveTextContent(/increase/)
  })

  it('gives a distinguished group a count but no net — its magnitude is a flag', () => {
    withEvents([
      {
        category: 'distinguished',
        clubId: '1',
        clubName: 'Alpha Club',
        label: 'Alpha Club became Distinguished',
        magnitude: 1,
      },
      {
        category: 'distinguished',
        clubId: '2',
        clubName: 'Beta Club',
        label: 'Beta Club lost Distinguished status',
        magnitude: -1,
      },
    ])

    expect(screen.getByText(/Distinguished status changes/)).toBeInTheDocument()
    expect(screen.queryByTestId('changes-group-net')).not.toBeInTheDocument()
    expect(screen.getByTestId('changes-group-count')).toHaveTextContent('(2)')
  })
})

/* #2425 — the "Clubs" tile becomes "Active clubs": the headline is the signed
   change in TI status Active, with per-status sub-lines and the full total. */
describe('DistrictChangesPage — Active clubs tile (#2425)', () => {
  const c = (from: number, to: number) => ({ from, to, delta: to - from })
  const statusTotals = (
    over: Partial<NonNullable<SnapshotDiffView['clubStatusTotals']>> = {}
  ): NonNullable<SnapshotDiffView['clubStatusTotals']> => ({
    byStatus: {
      Active: c(141, 139),
      Low: c(4, 5),
      Ineligible: c(2, 2),
      Suspended: c(15, 12),
    },
    unrecorded: c(0, 0),
    all: c(162, 158),
    statusMissingFrom: false,
    statusMissingTo: false,
    ...over,
  })

  const renderWith = (diff: SnapshotDiffView) => {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diff,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)
    renderPage()
    const card = screen
      .getAllByTestId('kpi-delta-card')
      .find(el => within(el).queryByText('Active clubs'))
    expect(card).toBeDefined()
    return card!
  }

  it('leads with the Active delta and from -> to, then status sub-lines and All clubs', () => {
    const card = renderWith(diffFixture({ clubStatusTotals: statusTotals() }))
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('−2')
    expect(within(card).getByText('141 → 139')).toBeInTheDocument()
    const items = within(within(card).getByTestId('kpi-delta-sublines'))
      .getAllByRole('listitem')
      .map(i => i.textContent)
    expect(items).toEqual([
      'Low 5 (+1)',
      'Ineligible 2',
      'Suspended 12 (−3)',
      'All clubs 158 (−4)',
    ])
    // The old "Clubs" title is gone; the other three tiles are unchanged.
    expect(screen.queryByRole('heading', { name: 'Clubs' })).toBeNull()
    expect(screen.getAllByTestId('kpi-delta-card')).toHaveLength(4)
  })

  it('omits a status with zero clubs at both ends, and shows unrecorded clubs', () => {
    const card = renderWith(
      diffFixture({
        clubStatusTotals: statusTotals({
          byStatus: {
            Active: c(150, 151),
            Low: c(0, 0),
            Ineligible: c(0, 1),
            Suspended: c(2, 0),
          },
          unrecorded: c(0, 1),
          all: c(152, 153),
        }),
      })
    )
    const items = within(within(card).getByTestId('kpi-delta-sublines'))
      .getAllByRole('listitem')
      .map(i => i.textContent)
    expect(items).toEqual([
      'Ineligible 1 (+1)',
      'Suspended 0 (−2)',
      'Status not recorded 1 (+1)',
      'All clubs 153 (+1)',
    ])
  })

  it('says status is not recorded instead of showing a silent 0', () => {
    const card = renderWith(
      diffFixture({
        clubStatusTotals: statusTotals({ statusMissingFrom: true }),
      })
    )
    const value = within(card).getByTestId('kpi-delta-value')
    expect(value).toHaveTextContent('—')
    expect(value).not.toHaveTextContent(/\d/)
    expect(card).toHaveTextContent('Club status not recorded on May 25, 2026')
    expect(
      within(within(card).getByTestId('kpi-delta-sublines'))
        .getAllByRole('listitem')
        .map(i => i.textContent)
    ).toEqual(['All clubs 158 (−4)'])
  })

  it('treats a diff with no status counts at all as not recorded', () => {
    const card = renderWith(diffFixture())
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('—')
    expect(card).toHaveTextContent('Club status not recorded')
  })
})

/* #2601 (Ron, 2026-11-09, spec change from #2438) — the Distinguished clubs
   tile leads with the signed change in CONFIRMED clubs, then "Confirmed a → b",
   then "+N provisional" (change in brackets only when non-zero). Confirmed is
   the analytics file's `distinguishedCounts`, falling back to the dated
   rankings row's `distinguishedClubs`. The old "TI count" line is gone. */
describe('DistrictChangesPage — Distinguished clubs tile (#2601)', () => {
  const rankingRow = (distinguishedClubs: number) =>
    ({ districtId: '61', distinguishedClubs }) as unknown as NonNullable<
      ReturnType<typeof useDistrictRanking>['ranking']
    >
  const counts = (confirmed: number, provisional: number) => ({
    counts: { confirmed, provisional },
    isLoading: false,
  })
  const noCounts = { counts: null, isLoading: false }

  const renderWith = (
    rankings: Record<string, ReturnType<typeof useDistrictRanking>>,
    analytics: Record<string, ReturnType<typeof useDistinguishedCountsAt>>
  ) => {
    mockedRanking.mockImplementation(
      (_id, date) => rankings[date ?? ''] ?? { ranking: null, isLoading: false }
    )
    mockedCounts.mockImplementation(
      (_id, date) => analytics[date ?? ''] ?? noCounts
    )
    mockedDates.mockReturnValue({
      data: { dates: ['2026-07-31', '2026-10-31'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockReturnValue({
      data: diffFixture({
        from: { date: '2026-07-31' },
        to: { date: '2026-10-31' },
        totals: {
          membership: ag(2716, 2742),
          payments: ag(5723, 5749),
          clubCount: ag(161, 162),
          distinguished: ag(0, 0),
        },
      }),
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useSnapshotDiff>)
    renderPage()
    const card = screen
      .getAllByTestId('kpi-delta-card')
      .find(el => within(el).queryByText('Distinguished clubs'))
    expect(card).toBeDefined()
    return card!
  }
  const subLines = (card: HTMLElement) =>
    within(within(card).getByTestId('kpi-delta-sublines'))
      .getAllByRole('listitem')
      .map(i => i.textContent)

  it('leads with the confirmed change, then Confirmed a → b and provisional', () => {
    const card = renderWith(
      {},
      { '2026-07-31': counts(3, 3), '2026-10-31': counts(3, 5) }
    )
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('0')
    expect(within(card).getByText('Confirmed 3 → 3')).toBeInTheDocument()
    expect(subLines(card)).toEqual(['+5 qualifying today (+2)'])
    expect(within(card).queryByText(/TI count/)).toBeNull()
    expect(mockedCounts).toHaveBeenCalledWith('61', '2026-07-31')
    expect(mockedCounts).toHaveBeenCalledWith('61', '2026-10-31')
  })

  it('signs a non-zero confirmed change and omits a zero provisional change', () => {
    const card = renderWith(
      {},
      { '2026-07-31': counts(1, 4), '2026-10-31': counts(4, 4) }
    )
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('+3')
    expect(within(card).getByText('Confirmed 1 → 4')).toBeInTheDocument()
    expect(subLines(card)).toEqual(['+4 qualifying today'])
  })

  it('falls back to the rankings row for confirmed and says provisional is not recorded', () => {
    const card = renderWith(
      {
        '2026-07-31': { ranking: rankingRow(0), isLoading: false },
        '2026-10-31': { ranking: rankingRow(3), isLoading: false },
      },
      {}
    )
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('+3')
    expect(within(card).getByText('Confirmed 0 → 3')).toBeInTheDocument()
    expect(subLines(card)).toEqual(['Qualifying today not recorded'])
  })

  it('says the provisional change is not recorded when the from date has no counts', () => {
    const card = renderWith(
      { '2026-07-31': { ranking: rankingRow(1), isLoading: false } },
      { '2026-10-31': counts(3, 2) }
    )
    expect(subLines(card)).toEqual([
      '+2 qualifying today (change not recorded)',
    ])
  })

  it('keeps a recorded provisional 0 at both ends distinct from not recorded', () => {
    const card = renderWith(
      {},
      { '2026-07-31': counts(2, 0), '2026-10-31': counts(2, 0) }
    )
    expect(subLines(card)).toEqual(['+0 qualifying today'])
  })

  it('mixes sources for the headline: from on rankings, to on analytics', () => {
    const card = renderWith(
      { '2026-07-31': { ranking: rankingRow(1), isLoading: false } },
      { '2026-10-31': counts(4, 2) }
    )
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('+3')
    expect(within(card).getByText('Confirmed 1 → 4')).toBeInTheDocument()
  })

  it('says provisional is not recorded when the to date has no counts but from does', () => {
    const card = renderWith(
      { '2026-10-31': { ranking: rankingRow(3), isLoading: false } },
      { '2026-07-31': counts(1, 4) }
    )
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('+2')
    expect(subLines(card)).toEqual(['Qualifying today not recorded'])
  })

  it('explains "qualifying today" in screen-reader text outside the list (#2580)', () => {
    const card = renderWith(
      {},
      { '2026-07-31': counts(3, 3), '2026-10-31': counts(3, 5) }
    )
    const note = within(card).getByTestId('kpi-delta-subnote')
    expect(note).toHaveClass('sr-only')
    expect(note).toHaveTextContent(PROVISIONAL_NOTE)
    // The note is not a sub-line, so the visible list is unchanged.
    expect(subLines(card)).toEqual(['+5 qualifying today (+2)'])
  })

  it('says confirmed is not recorded instead of a silent 0', () => {
    const card = renderWith(
      { '2026-10-31': { ranking: rankingRow(3), isLoading: false } },
      {}
    )
    expect(within(card).getByTestId('kpi-delta-value')).toHaveTextContent('—')
    expect(
      within(card).getByText('Confirmed clubs not recorded')
    ).toBeInTheDocument()
  })

  it('reserves the lines while a file is loading', () => {
    const card = renderWith(
      { '2026-07-31': { ranking: null, isLoading: true } },
      { '2026-10-31': counts(3, 1) }
    )
    expect(within(card).getByText('Confirmed clubs …')).toBeInTheDocument()
  })
})

/* #2452 — ?club= narrows What Changed to one club's events (the club page's
   Recent changes card links here), with a visible chip that clears it. */
describe('DistrictChangesPage club filter (#2452)', () => {
  let location = ''
  const LocationProbe: React.FC = () => {
    location = useLocation().search
    return null
  }

  function renderClub(initialEntry: string) {
    mockedDates.mockReturnValue({
      data: { dates: ['2026-05-19', '2026-05-25', '2026-05-26'] },
      isLoading: false,
    } as unknown as ReturnType<typeof useDistrictCachedDates>)
    mockedDiff.mockImplementation(
      (_districtId, from, to) =>
        ({
          data:
            from && to
              ? diffFixture({
                  from: { date: dateOf(from) },
                  to: { date: dateOf(to) },
                })
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

  it('shows only the named club’s events, matched across zero-padding', () => {
    renderClub('/district/61/changes?club=2959')
    const list = screen.getByTestId('changes-list')
    expect(list).toHaveTextContent('Club 00002959 became Distinguished')
    expect(list).not.toHaveTextContent('iA Montreal Toastmasters')
    expect(list).not.toHaveTextContent('Division G')
    expect(list).not.toHaveTextContent('Area 2')
  })

  it('names the club in a visible filter chip', () => {
    renderClub('/district/61/changes?club=28680300')
    const chip = screen.getByRole('region', { name: /club filter/i })
    expect(chip).toHaveTextContent('iA Montreal Toastmasters')
  })

  it('clears the filter from the chip and keeps the date pair', () => {
    renderClub('/district/61/changes?from=2026-05-25&to=2026-05-26&club=2959')
    fireEvent.click(screen.getByRole('button', { name: /remove club filter/i }))

    const params = new URLSearchParams(location)
    expect(params.get('club')).toBeNull()
    expect(params.get('from')).toBe('2026-05-25')
    expect(params.get('to')).toBe('2026-05-26')
    expect(
      screen.queryByRole('region', { name: /club filter/i })
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('changes-list')).toHaveTextContent(
      'iA Montreal Toastmasters'
    )
  })

  it('keeps the club filter across a date preset', () => {
    renderClub('/district/61/changes?club=2959')
    fireEvent.click(screen.getByTestId('changes-preset-week'))
    expect(new URLSearchParams(location).get('club')).toBe('2959')
  })

  it('says the club had no changes rather than showing the district’s', () => {
    renderClub('/district/61/changes?club=999999')
    expect(screen.queryByTestId('changes-list')).not.toBeInTheDocument()
    expect(screen.getByTestId('changes-none')).toHaveTextContent(
      /no recorded changes for this club/i
    )
    // An id the diff cannot name still gets a chip, so it can be cleared.
    expect(
      screen.getByRole('region', { name: /club filter/i })
    ).toHaveTextContent('Club 999999')
  })

  it('exports only the filtered club', () => {
    renderClub('/district/61/changes?club=28680300')
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    const exported = vi.mocked(exportSnapshotDiff).mock.calls[0]![0]
    expect(exported.events.map(e => e.clubId)).toEqual(['28680300'])
  })

  it('shows no chip without a club param', () => {
    renderClub('/district/61/changes')
    expect(
      screen.queryByRole('region', { name: /club filter/i })
    ).not.toBeInTheDocument()
  })

  /* #2459 — the club card lists weekly steps; this page shows one net change
     between the two end dates, so say so where the filter is named. */
  it('notes that a club-filtered view is the net change, not weekly steps', () => {
    renderClub('/district/61/changes?club=2959')
    expect(screen.getByTestId('changes-club-net-note')).toHaveTextContent(
      'Net change between these two dates; the club page lists each weekly step.'
    )
    // The chip itself is unchanged: the note sits beside it, not inside it.
    expect(
      screen.getByRole('region', { name: /club filter/i })
    ).not.toHaveTextContent(/net change/i)
  })

  it('shows no net-change note without a club param', () => {
    renderClub('/district/61/changes')
    expect(
      screen.queryByTestId('changes-club-net-note')
    ).not.toBeInTheDocument()
  })
})
