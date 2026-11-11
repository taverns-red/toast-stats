import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  DistinguishedDistrictTrophyCase,
  type DistinguishedDistrictStatus,
} from '../DistinguishedDistrictTrophyCase'
import type { RemainingInputs } from '../../utils/distinguishedCountdown'
import { requiredPrerequisitesForProgramYear } from '@taverns-red/analytics-core'

afterEach(() => cleanup())

/**
 * The five-gate era (#1354). Every prerequisite TI has ever required is in
 * force for 2025-26 and earlier, so this is the year the seven pre-#1354
 * assertions below were written against. They used to reach that
 * configuration by OMITTING `programYear` and landing on the component's
 * fallback; now they ask for it, through the supported API. Same coverage,
 * no accidental default.
 */
const LEGACY_PY = '2025-2026'

const baseStatus: DistinguishedDistrictStatus = {
  districtId: '61',
  currentTier: 'NotDistinguished',
  allPrerequisitesMet: true,
  prerequisites: {
    dspSubmitted: true,
    trainingMet: true,
    marketAnalysisSubmitted: true,
    communicationPlanSubmitted: true,
    regionAdvisorVisitMet: true,
  },
  nextTierGap: {
    tier: 'Distinguished',
    paymentGrowthGap: 2,
    clubGrowthGap: 5.5,
    distinguishedPercentGap: 13.6,
    netClubGrowthGap: 7,
    paidClubBase: 161,
    paymentBase: 5605,
  },
  // #840 — canonical absolute counts to the Distinguished gate. Match
  // the integers a region row would show; same shape as RegionPage.
  paidClubsRemaining: 11,
  paymentsRemaining: 169,
  distinguishedClubsRemaining: 20,
}

const baseRanking: RemainingInputs = {
  paidClubBase: 161,
  paidClubs: 152,
  paymentBase: 5605,
  totalPayments: 5493,
  distinguishedClubs: 53,
}

describe('DistinguishedDistrictTrophyCase', () => {
  describe('header', () => {
    it('renders the title and the program-item caption', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
        />
      )
      expect(
        screen.getByRole('heading', { name: /Distinguished District Status/i })
      ).toBeInTheDocument()
      expect(screen.getByText(/Program Item 1490/i)).toBeInTheDocument()
      expect(
        screen.queryByText(/Distinguished District Program/i)
      ).not.toBeInTheDocument()
    })

    it('renders the status pill with the current tier label', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
        />
      )
      const pill = screen.getByTestId('distinguished-status-pill')
      expect(pill).toHaveTextContent(/Not Yet Distinguished/i)
    })
  })

  describe('prerequisites — collapsed by default when all met', () => {
    it('collapses to a single summary line when all prerequisites are met', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
        />
      )
      const toggle = screen.getByRole('button', {
        name: /5 of 5 prerequisites met/i,
      })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(
        screen.queryByText(/District Success Plan submitted/i)
      ).not.toBeInTheDocument()
    })

    it('expands the prerequisites list when the toggle is clicked', async () => {
      const user = userEvent.setup()
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
        />
      )
      const toggle = screen.getByRole('button', {
        name: /5 of 5 prerequisites met/i,
      })
      await user.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(
        screen.getByText(/District Success Plan submitted/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/2\+ Region Advisor meetings/i)
      ).toBeInTheDocument()
    })
  })

  describe('prerequisites — auto-expanded when any item is missing', () => {
    it('renders a non-interactive status summary and the full list', () => {
      const unmet: DistinguishedDistrictStatus = {
        ...baseStatus,
        allPrerequisitesMet: false,
        prerequisites: {
          ...baseStatus.prerequisites,
          marketAnalysisSubmitted: false,
        },
      }
      render(
        <DistinguishedDistrictTrophyCase
          status={unmet}
          programYear={LEGACY_PY}
        />
      )
      // No toggle button when the list is locked open — the summary is a
      // status, not an interactive control.
      expect(
        screen.queryByRole('button', { name: /prerequisites met/i })
      ).not.toBeInTheDocument()
      expect(screen.getByText(/4 of 5 prerequisites met/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Market Analysis Plan submitted/i)
      ).toBeInTheDocument()
    })
  })

  // #1354 — TM retired the Region Advisor Visit requirement for 2026-27
  // and dropped the column from the export. The calculator still emits
  // all 5 booleans on `prerequisites` (legacy display shape), so the
  // checklist must drive its rows from the program year's REQUIRED set
  // rather than a fixed label map, or a legitimately-Distinguished
  // 2026-27 district shows a permanently-unmet Region Advisor row.
  describe('prerequisite checklist — driven by program year ruleset (#1354)', () => {
    it('renders four rows and no Region Advisor row for 2026-27', async () => {
      const user = userEvent.setup()
      const status2026: DistinguishedDistrictStatus = {
        ...baseStatus,
        allPrerequisitesMet: true,
        prerequisites: {
          dspSubmitted: true,
          trainingMet: true,
          marketAnalysisSubmitted: true,
          communicationPlanSubmitted: true,
          // Column dropped for 2026-27 — always coerced false, but it must
          // not render as an unmet row for a district that otherwise
          // earned its tier.
          regionAdvisorVisitMet: false,
        },
      }
      render(
        <DistinguishedDistrictTrophyCase
          status={status2026}
          programYear="2026-2027"
        />
      )
      const toggle = screen.getByRole('button', {
        name: /4 of 4 prerequisites met/i,
      })
      await user.click(toggle)
      expect(
        screen.getByText(/District Success Plan submitted/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/85% Director training complete/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Market Analysis Plan submitted/i)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Communication Plan submitted/i)
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/2\+ Region Advisor meetings/i)
      ).not.toBeInTheDocument()
    })

    it('still renders all five rows, including Region Advisor, for 2025-26', async () => {
      const user = userEvent.setup()
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
        />
      )
      const toggle = screen.getByRole('button', {
        name: /5 of 5 prerequisites met/i,
      })
      await user.click(toggle)
      expect(
        screen.getByText(/2\+ Region Advisor meetings/i)
      ).toBeInTheDocument()
    })
  })

  describe('gap to next tier — canonical countdown tiles (#840)', () => {
    /* The district tiles must consume the SAME integers the region row's
       "Remaining to Distinguished" cells consume — never a value derived
       from TI's pre-rounded gap %. Integer is the headline; percentage is
       the sub-item. Labels match the region page exactly. Lesson 103/104. */

    it('renders three tiles in Paid Clubs → Payments → Distinguished Clubs order with region-page labels', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          ranking={baseRanking}
          programYear={LEGACY_PY}
        />
      )
      const tiles = screen.getByTestId('distinguished-gap-tiles')
      const labels = within(tiles).getAllByTestId('gap-tile-label')
      expect(labels.map(l => l.textContent)).toEqual([
        'Paid Clubs',
        'Payments',
        'Distinguished Clubs',
      ])
      expect(screen.queryByText(/Club growth/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Payment growth/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/% Distinguished/i)).not.toBeInTheDocument()
    })

    it('renders the canonical integer as the headline and the percentage as a sub-item (no ~)', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          ranking={baseRanking}
          programYear={LEGACY_PY}
        />
      )
      const tiles = screen.getByTestId('distinguished-gap-tiles')
      const values = within(tiles).getAllByTestId('gap-tile-value')
      const subitems = within(tiles).getAllByTestId('gap-tile-subitem')

      // Headlines — exact canonical counts. Distinguished-Clubs is 20,
      // not 19 (the rounded-% derivation bug).
      expect(values[0]).toHaveTextContent(/^11 clubs?$/)
      expect(values[1]).toHaveTextContent(/^169 payments$/)
      expect(values[2]).toHaveTextContent(/^20 confirmed clubs$/)

      // Percentages are demoted to the sub-item, no "~" prefix on either.
      expect(subitems[0]).toHaveTextContent(/^\+5\.5%$/)
      expect(subitems[1]).toHaveTextContent(/^\+2\.0%$/)
      expect(subitems[2]).toHaveTextContent(/^\+13\.6%$/)

      // The "~" approximation marker is gone — the integer is exact now.
      values.forEach(v => expect(v.textContent).not.toMatch(/~/))
      subitems.forEach(s => expect(s.textContent).not.toMatch(/~/))
    })

    it('prefers the canonical status field over a derivation from the rankings row', () => {
      // status carries 20 (canonical); rankings derivation would give 20 too,
      // but if they disagreed the canonical field wins.
      const drifted = {
        ...baseStatus,
        distinguishedClubsRemaining: 22, // deliberately != derivation
      }
      render(
        <DistinguishedDistrictTrophyCase
          status={drifted}
          ranking={baseRanking}
          programYear={LEGACY_PY}
        />
      )
      const values = screen.getAllByTestId('gap-tile-value')
      expect(values[2]).toHaveTextContent(/^22 confirmed clubs$/)
    })

    it('derives counts from the rankings row when the canonical fields are absent', () => {
      const noCanonical: DistinguishedDistrictStatus = {
        ...baseStatus,
      }
      delete (noCanonical as Partial<DistinguishedDistrictStatus>)
        .paidClubsRemaining
      delete (noCanonical as Partial<DistinguishedDistrictStatus>)
        .paymentsRemaining
      delete (noCanonical as Partial<DistinguishedDistrictStatus>)
        .distinguishedClubsRemaining

      render(
        <DistinguishedDistrictTrophyCase
          status={noCanonical}
          ranking={baseRanking}
          programYear={LEGACY_PY}
        />
      )
      const values = screen.getAllByTestId('gap-tile-value')
      // Same headline integers via derivation: 11 / 169 / 20.
      expect(values[0]).toHaveTextContent(/^11 clubs?$/)
      expect(values[1]).toHaveTextContent(/^169 payments$/)
      expect(values[2]).toHaveTextContent(/^20 confirmed clubs$/)
    })

    it('uses the next-tier thresholds for districts already at Distinguished', () => {
      // Already at Distinguished, counting down to Select (+3% growth,
      // 50% distinguished, plus-one): from baseRanking →
      // paid: ceil(161 × 1.03) − 152 = 14; payments: ceil(5605 × 1.03) − 5493 = 281;
      // dist: ceil(161 × 0.50) − 53 = 28.
      const atDistinguished: DistinguishedDistrictStatus = {
        ...baseStatus,
        currentTier: 'Distinguished',
        nextTierGap: {
          ...baseStatus.nextTierGap!,
          tier: 'Select',
        },
      }
      // Remove canonical Distinguished-tier counts — they're for the wrong
      // gate when the next target is Select.
      delete (atDistinguished as Partial<DistinguishedDistrictStatus>)
        .paidClubsRemaining
      delete (atDistinguished as Partial<DistinguishedDistrictStatus>)
        .paymentsRemaining
      delete (atDistinguished as Partial<DistinguishedDistrictStatus>)
        .distinguishedClubsRemaining

      render(
        <DistinguishedDistrictTrophyCase
          status={atDistinguished}
          ranking={baseRanking}
          programYear={LEGACY_PY}
        />
      )
      const values = screen.getAllByTestId('gap-tile-value')
      expect(values[0]).toHaveTextContent(/^14 clubs$/)
      expect(values[1]).toHaveTextContent(/^281 payments$/)
      expect(values[2]).toHaveTextContent(/^28 confirmed clubs$/)
    })

    it('singularises the unit noun when the count is exactly 1', () => {
      const oneEach: DistinguishedDistrictStatus = {
        ...baseStatus,
        paidClubsRemaining: 1,
        paymentsRemaining: 1,
        distinguishedClubsRemaining: 1,
      }
      render(
        <DistinguishedDistrictTrophyCase
          status={oneEach}
          programYear={LEGACY_PY}
        />
      )
      const values = screen.getAllByTestId('gap-tile-value')
      expect(values[0]).toHaveTextContent(/^1 club$/)
      expect(values[1]).toHaveTextContent(/^1 payment$/)
      expect(values[2]).toHaveTextContent(/^1 confirmed club$/)
    })

    it('renders ✓ when a metric minimum is met (canonical remaining = 0)', () => {
      const closed: DistinguishedDistrictStatus = {
        ...baseStatus,
        paidClubsRemaining: 0,
        paymentsRemaining: 0,
        distinguishedClubsRemaining: 0,
      }
      render(
        <DistinguishedDistrictTrophyCase
          status={closed}
          programYear={LEGACY_PY}
        />
      )
      const values = screen.getAllByTestId('gap-tile-value')
      values.forEach(v => expect(v).toHaveTextContent('✓'))
      // No sub-item rendered when the gate is met.
      expect(screen.queryByTestId('gap-tile-subitem')).not.toBeInTheDocument()
    })
  })

  it('renders nothing when status is null', () => {
    const { container } = render(
      <DistinguishedDistrictTrophyCase status={null} programYear={LEGACY_PY} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  describe('loading slot reservation (#1105 — Lesson 107 CLS pattern)', () => {
    /* The competitive-awards query resolves separately from and later than
       the page analytics query that paints DistrictDetailPage. Without a
       reserved slot the trophy case pops in from 0px when that query lands
       and shoves everything below it down — the AwardsRaceSection (#750)
       failure class. While the awards query is in flight we render a
       height-matched skeleton so the real panel fills the slot in place. */

    it('renders a height-matched skeleton while the awards query is loading', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={null}
          isLoading
          programYear={LEGACY_PY}
        />
      )
      const skeleton = screen.getByTestId('distinguished-trophy-skeleton')
      expect(skeleton).toBeInTheDocument()
      // Reuses the real panel chrome so the loaded content lands in place.
      expect(skeleton).toHaveClass('redesign-panel')
      // Decorative — read by neither AT nor the gap-tile queries.
      expect(skeleton).toHaveAttribute('aria-hidden', 'true')
      // Reserves the dominant gap-tiles slot (3-up grid) that the loaded
      // panel renders, so the slot height is present before data arrives.
      expect(
        within(skeleton).getByTestId('distinguished-trophy-skeleton-tiles')
      ).toBeInTheDocument()
    })

    // #2571 — the print copy is laid out right after `beforeprint`, so a cold
    // Cmd-P can still hold a placeholder: it says so (print only, print.css)
    // and a second print has the data.
    it.each([
      ['loading', { isLoading: true }, 'distinguished-trophy-skeleton'],
      ['held', { held: true }, 'distinguished-trophy-held'],
    ])(
      'carries a print-only "print again" note while %s (#2571)',
      (_name, props, testId) => {
        render(
          <DistinguishedDistrictTrophyCase
            status={null}
            programYear={LEGACY_PY}
            {...props}
          />
        )
        const note = within(screen.getByTestId(testId)).getByText(
          /print again in a moment/i
        )
        expect(note).toHaveClass('print-held-note')
        expect(screen.getByTestId(testId)).toHaveClass('print-held-card')
      }
    )

    // #1647 — the loaded panel lists every required prerequisite (expanded
    // whenever one is unmet, the common case) plus the "must be met" warning;
    // the skeleton reserved neither, so the swap grew the panel 64-144px.
    it.each([LEGACY_PY, '2026-2027'])(
      'reserves one checklist row per %s prerequisite and the warning line (#1647)',
      programYear => {
        render(
          <DistinguishedDistrictTrophyCase
            status={null}
            isLoading
            programYear={programYear}
          />
        )
        const skeleton = screen.getByTestId('distinguished-trophy-skeleton')
        expect(
          within(skeleton).getAllByTestId(
            'distinguished-trophy-skeleton-prereq'
          )
        ).toHaveLength(requiredPrerequisitesForProgramYear(programYear).length)
        expect(
          within(skeleton).getByTestId('distinguished-trophy-skeleton-warning')
        ).toBeInTheDocument()
      }
    )

    it('still renders nothing when not loading and status is null', () => {
      const { container } = render(
        <DistinguishedDistrictTrophyCase
          status={null}
          isLoading={false}
          programYear={LEGACY_PY}
        />
      )
      expect(container).toBeEmptyDOMElement()
    })

    it('renders the real panel, not the skeleton, once status resolves even if isLoading is stale', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          isLoading
          programYear={LEGACY_PY}
        />
      )
      expect(
        screen.queryByTestId('distinguished-trophy-skeleton')
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /Distinguished District Status/i })
      ).toBeInTheDocument()
    })
  })

  // #1613 — shown for every program year (Ron's decision), with a note that
  // TI dropped the award from Item 1490 in Rev. 03/2026.
  describe('Club Strength award note (#1613)', () => {
    it('notes that TI removed Club Strength from Item 1490 in Rev. 03/2026', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
          clubStrengthQualifies
          clubStrengthGrowth={12.3}
        />
      )
      expect(screen.getByTitle(/Club Strength Award/)).toBeInTheDocument()
      expect(
        screen.getByText(/removed .*Item 1490 in Rev\. 03\/2026/i)
      ).toBeInTheDocument()
    })

    it('shows no Club Strength note when the award is not earned', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
          clubGrowthQualifies
        />
      )
      expect(screen.queryByText(/Rev\. 03\/2026/i)).not.toBeInTheDocument()
    })
  })

  describe('Leadership Excellence on track (#1609)', () => {
    it('mid-year, an on-track district says so — and does not list the award as earned', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
          leadershipExcellenceQualifies={false}
          leadershipExcellenceOnTrack={true}
          leadershipExcellenceYears={2}
        />
      )
      const note = screen.getByText(/on track for leadership excellence/i)
      expect(note.textContent).toMatch(/2 consecutive Distinguished years/i)
      expect(note.textContent).toMatch(/year-end close/i)
      expect(screen.queryByText(/Additional Awards Earned/i)).toBeNull()
    })

    it('a recipient shows the earned chip, not the on-track note', () => {
      render(
        <DistinguishedDistrictTrophyCase
          status={baseStatus}
          programYear={LEGACY_PY}
          leadershipExcellenceQualifies={true}
          leadershipExcellenceOnTrack={false}
          leadershipExcellenceYears={3}
        />
      )
      expect(screen.getByText(/Additional Awards Earned/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Leadership Excellence \(3yr\)/)
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/on track for leadership excellence/i)
      ).toBeNull()
    })
  })
})

/* Gap at every tier (#2426). Under the next-tier tiles, one row per tier of
   the program year's ladder with the paid clubs, payments and Distinguished
   clubs it still needs, or "met". Fixture: real D61, 2026-10-31 prod
   (competitive-awards.json + all-districts-rankings.json). */
describe('DistinguishedDistrictTrophyCase — gap at every tier (#2426)', () => {
  const CURRENT_PY = '2026-2027'
  const d61Status: DistinguishedDistrictStatus = {
    districtId: '61',
    currentTier: 'NotDistinguished',
    allPrerequisitesMet: true,
    prerequisites: {
      dspSubmitted: true,
      trainingMet: true,
      marketAnalysisSubmitted: true,
      communicationPlanSubmitted: true,
      regionAdvisorVisitMet: false,
    },
    nextTierGap: {
      tier: 'Distinguished',
      paymentGrowthGap: 40.6,
      clubGrowthGap: 13.03,
      distinguishedPercentGap: 43.10126582278481,
      netClubGrowthGap: 19,
      paidClubBase: 158,
      paymentBase: 5886,
    },
    paymentsRemaining: 2390,
    paidClubsRemaining: 21,
    distinguishedClubsRemaining: 69,
  }
  const d61Ranking: RemainingInputs = {
    paidClubBase: 158,
    paymentBase: 5886,
    paidClubs: 139,
    totalPayments: 3555,
    distinguishedClubs: 3,
  }

  const renderD61 = (
    status: DistinguishedDistrictStatus = d61Status,
    ranking: RemainingInputs | null = d61Ranking,
    programYear = CURRENT_PY
  ) =>
    render(
      <DistinguishedDistrictTrophyCase
        status={status}
        ranking={ranking}
        programYear={programYear}
      />
    )

  const rowCells = (tier: string) =>
    within(
      within(screen.getByTestId('distinguished-tier-gaps')).getByRole('row', {
        name: new RegExp(`^${tier}`),
      })
    )
      .getAllByRole('cell')
      .map(c => c.textContent)

  it('renders a table with one row per tier and the three requirement columns', () => {
    renderD61()
    const table = within(
      screen.getByTestId('distinguished-tier-gaps')
    ).getByRole('table')
    // Accessible names: the phone header abbreviates "Distinguished".
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(h => h.getAttribute('aria-label') ?? h.textContent)
    ).toEqual(['Tier', 'Paid clubs', 'Payments', 'Distinguished clubs'])
    expect(
      within(table).getByRole('columnheader', { name: 'Distinguished clubs' })
    ).toBeInTheDocument()
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map(h => h.textContent)
    ).toEqual(['Distinguished', 'Select', "President's", 'Smedley'])
  })

  it("shows each tier's remaining counts for real D61", () => {
    renderD61()
    expect(rowCells('Distinguished')).toEqual(['21', '2,390', '69'])
    expect(rowCells('Select')).toEqual(['24', '2,508', '76'])
    expect(rowCells("President's")).toEqual(['27', '2,626', '84'])
    expect(rowCells('Smedley')).toEqual(['32', '2,802', '92'])
  })

  it('marks a met requirement and a met tier', () => {
    renderD61(
      { ...d61Status, currentTier: 'Presidents' },
      {
        ...d61Ranking,
        paidClubs: 170,
        totalPayments: 6400,
        distinguishedClubs: 90,
      }
    )
    const gaps = screen.getByTestId('distinguished-tier-gaps')
    const select = within(gaps).getByRole('row', { name: /^Select/ })
    expect(select).toHaveAttribute('data-met', 'true')
    expect(
      within(select)
        .getAllByRole('cell')
        .map(c => c.textContent)
    ).toEqual(['✓ met', '✓ met', '✓ met'])
    expect(within(select).getByRole('rowheader')).toHaveTextContent(/met/i)
    const smedley = within(gaps).getByRole('row', { name: /^Smedley/ })
    expect(smedley).toHaveAttribute('data-met', 'false')
    expect(rowCells('Smedley')).toEqual(['1', '✓ met', '5'])
  })

  it('agrees with the next-tier tiles on the next tier', () => {
    renderD61()
    const values = within(
      screen.getByTestId('distinguished-gap-tiles')
    ).getAllByTestId('gap-tile-value')
    expect(values.map(v => v.textContent)).toEqual([
      '21 clubs',
      '2390 payments',
      '69 confirmed clubs',
    ])
    expect(rowCells('Distinguished')).toEqual(['21', '2,390', '69'])
  })

  it('cites Item 1490 for the thresholds, with a link to TI', () => {
    renderD61()
    const gaps = screen.getByTestId('distinguished-tier-gaps')
    expect(gaps).toHaveTextContent(/District Recognition Program/)
    expect(gaps).toHaveTextContent(/2026-2027 rules/)
    const link = within(gaps).getByRole('link', { name: /Item 1490/ })
    expect(link).toHaveAttribute(
      'href',
      'https://content.toastmasters.org/image/upload/1490-district-recognition-program.pdf'
    )
  })

  it('shows no table when the district has no rankings data', () => {
    renderD61(d61Status, null)
    expect(
      screen.queryByTestId('distinguished-tier-gaps')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /every tier/i })
    ).not.toBeInTheDocument()
  })

  it('folds the table behind a toggle on phones and always shows it from 768 up', async () => {
    renderD61()
    const toggle = screen.getByRole('button', { name: /every tier/i })
    expect(toggle).toHaveClass('md:hidden')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const gaps = screen.getByTestId('distinguished-tier-gaps')
    expect(toggle).toHaveAttribute('aria-controls', gaps.id)
    expect(gaps).toHaveClass('hidden', 'md:block')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(gaps).not.toHaveClass('hidden')
  })

  it("counts the next-tier tiles down under the year's own ladder (2024-25 Select)", () => {
    // Rev. 12/2022 Select: +3% payments, +1 net club, 45% Distinguished.
    // baseRanking → clubs 162 − 152 = 10, payments 5774 − 5493 = 281,
    // Distinguished clubs ceil(161 × 0.45) = 73 − 53 = 20.
    renderD61(
      {
        ...baseStatus,
        currentTier: 'Distinguished',
        nextTierGap: { ...baseStatus.nextTierGap!, tier: 'Select' },
        paidClubsRemaining: 0,
        paymentsRemaining: 0,
        distinguishedClubsRemaining: 0,
      },
      baseRanking,
      '2024-2025'
    )
    const values = screen.getAllByTestId('gap-tile-value')
    expect(values.map(v => v.textContent)).toEqual([
      '10 clubs',
      '281 payments',
      '20 confirmed clubs',
    ])
    expect(rowCells('Select')).toEqual(['10', '281', '20'])
  })

  /* The 375 Overview has no row to spare (PAGE_MAX_H): next to the toggle,
     "Gap to Distinguished District" wrapped onto a second line on CI's
     Linux fonts (4007 > 4000). Phones show the short tier name; the
     heading's name stays whole for AT and from 768 up. */
  it('shortens the gap heading on phones so the toggle shares one line', () => {
    renderD61()
    const heading = screen.getByRole('heading', {
      name: 'Gap to Distinguished District',
    })
    const phone = within(heading).getByText('Gap to Distinguished')
    expect(phone).toHaveClass('md:hidden')
    const wide = within(heading).getByText('Gap to Distinguished District')
    expect(wide).toHaveClass('hidden', 'md:inline')
  })

  it("shortens a higher tier's heading the same way", () => {
    renderD61({
      ...d61Status,
      currentTier: 'Distinguished',
      nextTierGap: { ...d61Status.nextTierGap!, tier: 'Presidents' },
    })
    const heading = screen.getByRole('heading', {
      name: "Gap to President's Distinguished District",
    })
    expect(within(heading).getByText("Gap to President's")).toHaveClass(
      'md:hidden'
    )
  })

  it('reserves the table from 768 up while loading', () => {
    render(
      <DistinguishedDistrictTrophyCase
        status={null}
        isLoading
        programYear={CURRENT_PY}
      />
    )
    const reserved = screen.getByTestId('distinguished-trophy-skeleton-tiers')
    expect(reserved).toHaveClass('hidden', 'md:block', 'invisible')
    expect(within(reserved).getAllByRole('row', { hidden: true })).toHaveLength(
      5
    )
  })
})
