import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DistrictDetailHeader } from '../DistrictDetailHeader'
import { getProgramYear } from '../../utils/programYear'
import { useLatestAsOfDate } from '../../hooks/useLatestAsOfDate'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

// Mock the global freshness source so the presentational header stays testable
// without a QueryClientProvider. Default: no reconciliation.
vi.mock('../../hooks/useLatestAsOfDate', () => ({
  useLatestAsOfDate: vi.fn(() => ({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  })),
}))
const mockUseLatestAsOfDate = vi.mocked(useLatestAsOfDate)

afterEach(() => cleanup())
beforeEach(() =>
  mockUseLatestAsOfDate.mockReturnValue({
    asOfDate: undefined,
    latestSnapshotDate: undefined,
  })
)

const py2526 = getProgramYear(2025)

/** Typed `undefined` for the optional branded date — an annotation, not a
 *  cast, so the SnapshotDate cast ban stays intact (#1323/#1368). A function,
 *  because a `const` of a union initialised to `undefined` gets narrowed to
 *  `undefined` and `renderHeader`'s `Partial<typeof baseProps>` would then
 *  reject a real date. */
const noDate = (): SnapshotDate | undefined => undefined
const latestDate = (): string | undefined => snap('2026-04-26')

const baseProps = {
  districtId: '61',
  districtName: 'District 61',
  selectedProgramYear: py2526,
  setSelectedProgramYear: vi.fn(),
  availableProgramYears: [py2526],
  selectedDate: noDate(),
  onDateChange: vi.fn(),
  availableDates: [snap('2026-04-26')],
  latestSnapshotDate: latestDate(),
  freshnessPending: false,
}

const renderHeader = (overrides: Partial<typeof baseProps> = {}) =>
  render(
    <MemoryRouter>
      <DistrictDetailHeader {...baseProps} {...overrides} />
    </MemoryRouter>
  )

describe('DistrictDetailHeader DataControlsBar adoption (#531 #528)', () => {
  it('renders the unified DataControlsBar toolbar in the header actions', () => {
    renderHeader()
    expect(
      screen.getByRole('toolbar', { name: /data controls/i })
    ).toBeInTheDocument()
  })

  it('does not render the legacy global-date-selector <select>', () => {
    renderHeader()
    expect(screen.queryByLabelText(/view specific date/i)).toBeNull()
    expect(document.getElementById('global-date-selector')).toBeNull()
  })
})

describe('DistrictDetailHeader mobile sub-line collapse (#890)', () => {
  it('renders a compact PY suffix inside the title (shown on mobile via CSS)', () => {
    renderHeader()
    const suffix = screen.getByTestId('page-header-title-py')
    // Lives inside the H1 title so it collapses onto the title line on mobile.
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toContainElement(suffix)
    expect(title).toHaveTextContent('District 61')
    expect(suffix).toHaveTextContent(/·\s*PY\s*2025-26/)
  })

  it('keeps the full Program Year eyebrow in the DOM (shown on desktop)', () => {
    renderHeader()
    // Desktop sub-line unchanged — the eyebrow still carries the full label;
    // CSS hides it <768px. Both surfaces render so neither width loses the PY.
    expect(screen.getByText(/Program Year 2025–2026/)).toBeInTheDocument()
  })
})

describe('DistrictDetailHeader action cluster consolidation (#676)', () => {
  it('moves Export + Share behind a single overflow menu, not inline buttons', () => {
    renderHeader()
    // Secondary actions are collapsed — no standalone Export/Share buttons.
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull()
    // A single overflow trigger replaces them.
    expect(
      screen.getByRole('button', { name: /more actions/i })
    ).toBeInTheDocument()
  })

  it('reveals Export CSV + Copy link when the overflow menu opens', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByRole('button', { name: /more actions/i }))
    expect(
      screen.getByRole('menuitem', { name: /export csv/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /copy link/i })
    ).toBeInTheDocument()
  })

  it('keeps the PY and snapshot-date controls inline (no regression)', () => {
    renderHeader()
    expect(
      screen.getByRole('toolbar', { name: /data controls/i })
    ).toBeInTheDocument()
    expect(screen.getByTestId('py-chip')).toBeInTheDocument()
    expect(screen.getByTestId('date-chip')).toBeInTheDocument()
  })
})

describe('DistrictDetailHeader freshness parity (#1310)', () => {
  it('shows the month-end reconciliation pill when the global as-of date has advanced past the district month-end', () => {
    mockUseLatestAsOfDate.mockReturnValue({
      asOfDate: '2026-07-02',
      latestSnapshotDate: snap('2026-06-30'),
    })
    // Viewing the district's latest snapshot (no explicit date), and that latest
    // === the global pinned month-end → reconciliation is live.
    renderHeader({
      selectedDate: undefined,
      latestSnapshotDate: snap('2026-06-30'),
    })
    const pill = screen.getByTestId('freshness-pill')
    expect(pill).toHaveTextContent(/As of Jul 2, 2026/)
    expect(pill).toHaveTextContent(/month-end reconciliation/i)
    expect(pill.getAttribute('data-reconciling')).toBe('true')
  })

  it('does NOT flag reconciliation for a district whose latest snapshot lags the global scrape', () => {
    mockUseLatestAsOfDate.mockReturnValue({
      asOfDate: '2026-07-02',
      latestSnapshotDate: snap('2026-06-30'),
    })
    // District's newest is May 31 — it lags behind the global June month-end, so
    // the July as-of date must not paint a spurious "May reconciliation".
    renderHeader({
      selectedDate: undefined,
      latestSnapshotDate: snap('2026-05-31'),
    })
    const pill = screen.getByTestId('freshness-pill')
    expect(pill).not.toHaveTextContent(/month-end reconciliation/i)
    expect(pill.getAttribute('data-reconciling')).toBeNull()
    expect(pill).toHaveTextContent(/Data fresh · May 31, 2026/)
  })

  it('does NOT flag reconciliation when viewing a finalized historical date', () => {
    mockUseLatestAsOfDate.mockReturnValue({
      asOfDate: '2026-07-02',
      latestSnapshotDate: snap('2026-06-30'),
    })
    // A specific past date is selected (not the latest) → isLatest false. The
    // pill reflects the VIEWED date, matching DistrictsPage.
    renderHeader({
      selectedDate: snap('2026-05-31'),
      latestSnapshotDate: snap('2026-06-30'),
    })
    const pill = screen.getByTestId('freshness-pill')
    expect(pill).not.toHaveTextContent(/month-end reconciliation/i)
    expect(pill.getAttribute('data-reconciling')).toBeNull()
    expect(pill).toHaveTextContent(/Data fresh · May 31, 2026/)
  })

  // #1647 — at 412px the toolbar laid out on one row while the date index
  // loaded, then wrapped to three once the freshness pill arrived (+104px),
  // shifting everything below. The page says when the date is still pending,
  // and the header reserves the pill's slot (the #922 placeholder).
  it('reserves the freshness pill slot while the snapshot date is pending', () => {
    renderHeader({ latestSnapshotDate: undefined, freshnessPending: true })
    expect(screen.getByTestId('freshness-pill-skeleton')).toBeInTheDocument()
  })

  it('does not reserve a pill slot once the date has resolved', () => {
    renderHeader({ freshnessPending: false })
    expect(
      screen.queryByTestId('freshness-pill-skeleton')
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('freshness-pill')).toBeInTheDocument()
  })
})

describe('DistrictDetailHeader phone context bar (#1831)', () => {
  const renderAt = (path: string, overrides: Partial<typeof baseProps> = {}) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <DistrictDetailHeader {...baseProps} {...overrides} />
      </MemoryRouter>
    )

  it('backs up to Districts from the district hub', () => {
    renderAt('/district/61')
    const bar = screen.getByTestId('context-bar')
    expect(
      within(bar).getByRole('link', { name: 'Back to Districts' })
    ).toHaveAttribute('href', '/')
  })

  it('backs up ONE level — to the district hub — from a section route', () => {
    renderAt('/district/61/clubs')
    const bar = screen.getByTestId('context-bar')
    expect(
      within(bar).getByRole('link', { name: 'Back to District 61' })
    ).toHaveAttribute('href', '/district/61')
  })

  it('shows the selected PY and the viewed date in the chip (R3 props)', () => {
    renderAt('/district/61', {
      selectedDate: snap('2026-04-12'),
      availableDates: [snap('2026-04-12'), snap('2026-04-26')],
    })
    expect(screen.getByTestId('context-bar-chip')).toHaveTextContent(
      'PY 25–26 · Apr 12'
    )
  })

  it('falls back to the latest snapshot date when no date is selected', () => {
    renderAt('/district/61')
    expect(screen.getByTestId('context-bar-chip')).toHaveTextContent(
      'PY 25–26 · Apr 26'
    )
  })

  it('keeps the H1 in the DOM for a11y/SEO', () => {
    renderAt('/district/61/clubs')
    expect(
      screen.getByRole('heading', { level: 1, name: /District 61/ })
    ).toBeInTheDocument()
  })

  it('sheet: PY/date drive the same setters, plus actions, About and the full trail', async () => {
    const setPy = vi.fn()
    const onDate = vi.fn()
    const py2425 = getProgramYear(2024)
    renderAt('/district/61/clubs', {
      setSelectedProgramYear: setPy,
      onDateChange: onDate,
      availableProgramYears: [py2526, py2425],
    })
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    const sheet = screen.getByRole('dialog', { name: 'District 61' })

    await userEvent.selectOptions(
      within(sheet).getByLabelText('Program year'),
      '2024'
    )
    expect(setPy).toHaveBeenCalledWith(py2425)
    await userEvent.selectOptions(
      within(sheet).getByLabelText('Snapshot date'),
      '2026-04-26'
    )
    expect(onDate).toHaveBeenCalledWith('2026-04-26')

    expect(
      within(sheet).getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
    expect(
      within(sheet).getByRole('button', { name: 'Copy link' })
    ).toBeInTheDocument()
    expect(within(sheet).getByText(/Membership, payments/)).toBeInTheDocument()

    const trail = within(sheet).getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(trail)
        .getAllByRole('listitem')
        .map(li => li.textContent)
    ).toEqual(['Districts', 'District 61', 'Clubs'])
  })
})
