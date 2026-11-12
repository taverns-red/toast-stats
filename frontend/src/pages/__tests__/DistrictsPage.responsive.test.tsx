/**
 * DistrictsPage landing rankings table: responsive + sticky (#811, epic #813
 * Sprint 3), as amended by the shared DataTable migration (#2689, #2676 M1).
 *
 * The landing rankings table is a LEADERBOARD: its value is comparing
 * districts across rows, so it keeps the table (no card collapse, Lesson 105).
 * The responsive contract is now:
 *   (1) while the chosen columns fit, the table is NOT a scroll container
 *       (the header sticks to the page); only when they cannot fit does the
 *       wrapper become a focusable, labelled region with edge cues (spec 5.2,
 *       11: "the scroll region is focusable and labelled only when it actually
 *       overflows");
 *   (2) ONE sticky key column (District), no hardcoded second sticky (AC #2);
 *   (3) which columns show is TanStack column visibility with a Columns menu,
 *       "never CSS display:none" (ADR-006 Addendum 2): no per-column priority
 *       classes (Ron, 2026-11-12);
 *   (4) >=44px touch targets on the row action buttons (Lesson 111).
 *
 * jsdom can't evaluate media queries or measure px, so these assert the
 * structural hooks; the live per-breakpoint behaviour is proven on the PR
 * preview channel (e2e/rankings-data-table.smoke.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'
import DistrictsPage from '../DistrictsPage'
import { fetchCdnRankings } from '../../services/cdn'
import { renderWithProviders } from '../../__tests__/test-utils'

vi.mock('../../services/cdn', () => ({
  fetchCdnDates: vi.fn().mockResolvedValue({
    dates: [],
    count: 0,
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  fetchCdnSnapshotIndex: vi.fn().mockResolvedValue({}),
  fetchCdnRankings: vi.fn(),
  fetchCdnManifest: vi.fn().mockResolvedValue({
    latestSnapshotDate: '2025-11-22',
    generatedAt: '2025-01-01T00:00:00Z',
  }),
  cdnAnalyticsUrl: vi.fn().mockReturnValue('https://cdn.taverns.red/test'),
  fetchFromCdn: vi.fn(),
}))

vi.mock('../../hooks/useDistricts', () => ({
  useDistricts: () => ({
    data: { districts: [] },
    isLoading: false,
    isError: false,
  }),
}))

const mockedFetchCdnRankings = vi.mocked(fetchCdnRankings)

const setupSingleRow = () => {
  mockedFetchCdnRankings.mockResolvedValue({
    rankings: [
      {
        districtId: '7',
        districtName: 'District 7',
        region: '7',
        paidClubs: 100,
        paidClubBase: 90,
        clubGrowthPercent: 11.1,
        totalPayments: 5000,
        paymentBase: 4500,
        paymentGrowthPercent: 11.1,
        activeClubs: 100,
        distinguishedClubs: 50,
        selectDistinguished: 20,
        presidentsDistinguished: 10,
        distinguishedPercent: 50,
        clubsRank: 1,
        paymentsRank: 1,
        distinguishedRank: 1,
        aggregateScore: 300,
        overallRank: 1,
      },
    ],
    asOfDate: '2025-11-22',
  } as never)
}

const headerByText = (re: RegExp): HTMLElement => {
  const table = screen.getByRole('table', { name: /district rankings/i })
  const headers = within(table).getAllByRole('columnheader')
  const match = headers.find(h => re.test(h.textContent?.trim() ?? ''))
  if (!match) throw new Error(`no column header matching ${re}`)
  return match
}

/**
 * The CLS-stable shell invariant (#826/#488/#861, Lesson 125): every terminal
 * state (loading + both error branches + loaded) reserves the hero-search slot
 * ABOVE a KPI strip whose mobile height is fixed by the 3-card demotion. Shared
 * by the loading-slot test (#861) and the error-state tests (#915 V9) so the
 * invariant has one definition.
 */
/** True when `a` precedes `b` in document order. */
const precedesInDom = (a: Element, b: Element): boolean =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

const expectReservedShell = (container: HTMLElement) => {
  // #2249 — the reserve IS the real hero search (LandingSearch needs no
  // data), first in the stack in every state, so it cannot drift from the
  // loaded field. It still carries the --hero modifier the stack's hoist
  // rule keys on.
  const skel = container.querySelector('.districts-hero-search')
  const strip = container.querySelector('.districts-kpi-strip')
  expect(skel).not.toBeNull()
  expect(strip).not.toBeNull()
  expect(skel!.closest('.districts-hero-stack')).not.toBeNull()
  expect(skel!.classList.contains('districts-toolbar__search--hero')).toBe(true)
  expect(precedesInDom(skel!, strip!)).toBe(true)
  expect(strip!.closest('.districts-hero-stack')).not.toBeNull()
  // 3 secondary KPI cards → the strip's mobile height matches across states.
  expect(
    container.querySelectorAll('.districts-kpi-card--secondary').length
  ).toBe(3)
  // #922: the loaded header stacks an actions toolbar (freshness/PY/date
  // chips + Export/Share) between the intro and the KPI strip on mobile.
  // The shell must reserve that slot too, inside the header (so the header's
  // column gap applies identically) and above the strip — or loading→loaded
  // shifts the strip down ~148px at 390px. jsdom can't measure the height
  // (Lesson 66); e2e/landing-mobile-cls.smoke.ts proves the geometry live.
  const actionsSkel = container.querySelector(
    '.districts-page-header__actions--skeleton'
  )
  expect(actionsSkel).not.toBeNull()
  expect(actionsSkel!.getAttribute('aria-hidden')).toBe('true')
  expect(actionsSkel!.closest('.districts-page-header')).not.toBeNull()
  expect(precedesInDom(actionsSkel!, strip!)).toBe(true)
}

describe('DistrictsPage rankings table — responsive + sticky (#811)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('is not a scroll region while the columns fit, and carries edge cues for when they do not', async () => {
    setupSingleRow()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    // jsdom has no layout (width 0), so nothing overflows: the wrapper must
    // not be a focusable region (an unlabelled scroll region is an a11y
    // failure) and must not scroll, or the header could not stick to the page.
    const wrap = container.querySelector('.dt-scroll')!
    expect(wrap).toHaveAttribute('data-overflow', 'false')
    expect(wrap).not.toHaveAttribute('tabindex')
    expect(wrap).not.toHaveAttribute('role')
    expect(wrap.className).not.toMatch(/overflow-x-auto/)
    expect(
      screen.queryByRole('region', { name: /district rankings/i })
    ).toBeNull()

    // Edge cues (Lesson 105, non-trap move #3), shown only when there is more
    // to scroll to in that direction.
    expect(container.querySelector('.dt-scroll__cue--end')).not.toBeNull()
  })

  it('makes District the single sticky key column (no hardcoded second sticky)', async () => {
    setupSingleRow()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    const districtCell = screen.getByTestId('district-cell-7')
    expect(districtCell.className).toMatch(/rankings-sticky-col/)

    // AC #2: the Rank column must NOT be a second hardcoded sticky column —
    // that `left-[200px]` magic-number seam is exactly what this sprint removes.
    const rankCell = screen.getByTestId('rank-cell-7')
    expect(rankCell.className).not.toMatch(/sticky-col/)
    expect(rankCell.className).not.toMatch(/left-\[200px\]/)
    expect(rankCell.className).not.toMatch(/\bsticky\b/)
  })

  it('keeps the sticky District cell on themed tokens, with no tint hook or bg-white', async () => {
    setupSingleRow()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    // Lesson 116: a hardcoded bg-white routes to the lighter dark scale. The
    // cell's surface comes from CSS tokens, and the my-district marker is a
    // bar plus words on the row (data-mine), not a tint on the cell.
    const districtCell = screen.getByTestId('district-cell-7')
    expect(districtCell.className).not.toMatch(/bg-white/)
    expect(districtCell).not.toHaveAttribute('data-row-tint')
  })

  it('has no per-column priority classes: the width picks defaults, the Columns menu overrides', async () => {
    setupSingleRow()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    // Always shown: District, Rank, Score.
    for (const re of [/^district$/i, /^rank$/i, /^score$/i]) {
      expect(headerByText(re)).toBeInTheDocument()
    }
    expect(container.querySelector('[class*="__col--"]')).toBeNull()
    // The desktop-only rung used to hold Tier. #1361 pulled that column — it
    // was `—` for the majority of districts — and moved the tier badge into the
    // District cell.
    expect(() => headerByText(/^tier$/i)).toThrow()
  })

  it('gives the row action button a ≥44px touch-target class', async () => {
    setupSingleRow()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    // The Star ("my district", #417) is the only row action left: #1364
    // retired select-to-compare and its per-row bookmark button in the Rank
    // cell. Lesson 111's 44px floor still applies to the survivor.
    const star = screen.getByRole('button', { name: /my district/i })
    expect(star.className).toMatch(/districts-rankings-table__touch-btn/)
    expect(screen.queryByRole('button', { name: /pin district 7/i })).toBeNull()
  })

  it('exposes the rank badge by a stable testid (not by sticky-ness)', async () => {
    setupSingleRow()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    const badge = screen.getByTestId('rank-badge-7')
    expect(badge.textContent?.trim()).toBe('1')
  })
})

/**
 * Landing hero hoist + KPI demotion (#861, epic #865 Sprint 1).
 *
 * Mobile-first triage: the "Find your district" hero search must sit above the
 * fold at 375px, and the 4-card global KPI strip collapses to a single
 * headline tile (Paid Clubs · Global) below 768px, restoring the full strip at
 * ≥768px. jsdom has no layout/media queries (Lesson 66), so these assert the
 * structural hooks the CSS keys off; the live per-breakpoint position + the
 * single-visible-tile are proven on the PR preview channel (both engines).
 *
 * CLS guard (#826/#488, Lesson 125): the loaded state hoists the search above
 * the KPI strip, so the shared shell (loading + both error states) must reserve
 * the same slot, or the KPI strip shifts down on data-load and re-opens the
 * ~0.2 CLS that lessons 79/107/125 closed.
 */
describe('DistrictsPage landing hero hoist + KPI demotion (#861)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps Paid Clubs · Global as the primary tile and marks the other three secondary (hidden <768px)', async () => {
    setupSingleRow()
    renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    const primary = screen
      .getByTestId('kpi-paid-clubs')
      .closest('.districts-kpi-card') as HTMLElement
    expect(primary.className).not.toMatch(/districts-kpi-card--secondary/)

    for (const tid of [
      'kpi-total-payments',
      'kpi-distinguished-clubs',
      'kpi-districts-tracked',
    ]) {
      const card = screen
        .getByTestId(tid)
        .closest('.districts-kpi-card') as HTMLElement
      expect(card.className).toMatch(/districts-kpi-card--secondary/)
    }
  })

  it('wraps the hero search and the KPI strip in one reorder stack so the search can hoist on mobile', async () => {
    setupSingleRow()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    const stack = container.querySelector('.districts-hero-stack')
    expect(stack).not.toBeNull()
    expect(
      stack!.querySelector('.districts-toolbar__search--hero')
    ).not.toBeNull()
    expect(stack!.querySelector('.districts-kpi-strip')).not.toBeNull()
  })

  it('reserves the hoisted-search slot in the loading shell, before the KPI strip (CLS-stable swap)', async () => {
    // Pending fetch → component stays in the isLoading shell.
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}) as never)
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByRole('status', { name: /loading district rankings/i })

    // Lesson 125: the loading shell reserves the same slot as loaded + error.
    expectReservedShell(container)
  })

  /**
   * #1359 — the shell reserved the KPI strip and the mobile search but not the
   * data-dependent hero slots, so when the rankings landed the Awards Race,
   * region toolbar and desktop search all appeared at once and pushed the
   * rankings table down 452px at 1350px (328px at 375px). CLS 0.179 of a 0.1
   * budget, on the landing page, on every first visit.
   *
   * jsdom has no layout engine, so these assert the STRUCTURE that produces
   * the geometry (Lesson 66) — each reserve is the real element the loaded
   * tree renders, inside the same stack, so it cannot drift from what it
   * reserves for. The heights themselves were verified in a real browser
   * against the committed Lighthouse fixtures.
   */
  it('reserves the data-dependent hero slots in the loading shell (#1359)', async () => {
    mockedFetchCdnRankings.mockReturnValue(new Promise(() => {}) as never)
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByRole('status', { name: /loading district rankings/i })

    const stack = container.querySelector('.districts-hero-stack')
    expect(stack).not.toBeNull()
    // Region toolbar + its chip row.
    expect(stack!.querySelector('.districts-toolbar')).not.toBeNull()
    expect(stack!.querySelector('.districts-toolbar__row')).not.toBeNull()
    // #2249 — the Awards Race moved below the table; its own skeleton (same
    // component, not a look-alike) is reserved there, after the loading
    // body, with its <768px link.
    expect(stack!.querySelector('.awards-race')).toBeNull()
    const status = screen.getByRole('status', {
      name: /loading district rankings/i,
    })
    const section = container.querySelector('.awards-race')
    expect(section).not.toBeNull()
    expect(precedesInDom(status, section!)).toBe(true)
    expect(container.querySelector('.awards-race-mobile-link')).not.toBeNull()
  })

  it('does not reserve the pulsing slots in a terminal error state (#1359)', async () => {
    // Those slots animate. A skeleton that pulses forever above an error card
    // reads as broken, and no user reaches a *loaded* page through this
    // branch, so there is no swap left to protect.
    mockedFetchCdnRankings.mockRejectedValue(new Error('CDN boom') as never)
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText(/unable to load|error/i)

    expect(container.querySelector('.awards-race')).toBeNull()
    expect(container.querySelector('.districts-toolbar')).toBeNull()
  })
})

/**
 * Terminal-state CLS-slot reservation (#915, epic #917 Sprint 4 — V9; Lesson 125).
 *
 * #826 unified the OUTER geometry across loading / both error branches / loaded
 * (`.districts-page-root > .districts-page`), and the test above proves the
 * LOADING shell reserves the hoisted-search slot + KPI strip + 3-card demotion.
 * But the deep-dive (§3 V9) flagged that only the *loading* slot was covered —
 * a CDN flake renders the **error/empty** state, whose reserved-slot geometry
 * was unverified. If a future refactor lets an error branch bypass `renderShell`
 * (or drop the demotion), the loaded↔error swap re-opens the ~0.2 CLS that
 * lessons 79/107/125 closed, and it only ever fires when the CDN flakes — green
 * most days, red on luck. These lock the error terminal states to the SAME
 * reserved geometry, so the Lighthouse CLS gate can't be ambushed by which
 * terminal state the run happened to render.
 */
describe('DistrictsPage terminal-state CLS slot (#915 V9, Lesson 125)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reserves the hero-search slot + KPI strip in the no-snapshot welcome state', async () => {
    mockedFetchCdnRankings.mockRejectedValue(
      new Error('CDN rankings fetch failed: 404')
    )
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('Welcome to Toast-Stats!')
    expectReservedShell(container)
  })

  it('reserves the hero-search slot + KPI strip in the generic error state', async () => {
    mockedFetchCdnRankings.mockRejectedValue(new Error('Something went wrong'))
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('Error Loading Rankings')
    expectReservedShell(container)
  })
})

/**
 * Mobile sub-line collapse (#890, epic #891 Sprint 2 — Epic H / CC-11).
 *
 * The landing header carries the same redundant "Program Year 2025–2026"
 * eyebrow as the district-detail header. At <768px it collapses into a compact
 * "· PY 2025-26" suffix on the title line to recover ~80px above the fold;
 * desktop keeps the eyebrow above the title. jsdom has no media queries
 * (Lesson 66), so these assert the structural hooks the CSS keys off — the
 * per-breakpoint visibility is proven on the PR preview channel.
 *
 * Scope guard (Lesson 120/131): `.districts-page-header__eyebrow` is SHARED
 * chrome (RegionPage / RegionsPage / DivisionPage / AreaPage reuse it with
 * non-PY text). The mobile hide is keyed off a landing-only `--py` modifier so
 * those siblings' eyebrows are untouched.
 */
describe('DistrictsPage mobile sub-line collapse (#890)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a compact PY suffix inside the landing title (shown on mobile via CSS)', async () => {
    setupSingleRow()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    const suffix = container.querySelector('.page-header__title-py')
    expect(suffix).not.toBeNull()
    expect(suffix!.textContent).toMatch(/·\s*PY\s*\d{4}-\d{2}/)

    const title = screen.getByRole('heading', {
      level: 1,
      name: /find a district, club or region/i,
    })
    expect(title).toContainElement(suffix as HTMLElement)
  })

  it('marks the landing eyebrow with the --py modifier so only the landing hides it on mobile', async () => {
    setupSingleRow()
    const { container } = renderWithProviders(<DistrictsPage />)
    await screen.findByText('District 7')

    const eyebrow = container.querySelector('.districts-page-header__eyebrow')
    expect(eyebrow).not.toBeNull()
    // Scope marker — the shared eyebrow rule is NOT touched; only --py hides.
    expect(eyebrow!.className).toMatch(/districts-page-header__eyebrow--py/)
    // Full label preserved for desktop (CSS hides it <768px).
    expect(eyebrow!.textContent).toMatch(/Program Year \d{4}–\d{4}/)
  })
})
