import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { EducationAwardsLeaderboard } from '../EducationAwardsLeaderboard'
import type {
  EducationAwardEntry,
  EducationAwardRanking,
} from '../../utils/educationAwardRankings'

/* Component tests for the education-award leaderboards (#1592). Rendered
   directly with fixture rankings — never via the page (R22). */

afterEach(() => cleanup())

const entry = (
  n: number,
  numerator: number,
  denominator: number,
  rank: number | null
): EducationAwardEntry => ({
  clubId: `${1000 + n}`,
  clubName: `Club ${n}`,
  divisionId: 'B',
  areaId: '12',
  membershipBase: denominator,
  numerator,
  denominator,
  ratio: denominator > 0 ? numerator / denominator : 0,
  rank,
})

const ranking = (
  overrides: Partial<EducationAwardRanking> = {}
): EducationAwardRanking => ({
  available: true,
  sourceReportType: 'education-achievements',
  asOf: 'October 01, 2026',
  ranked: [],
  ineligible: [],
  ...overrides,
})

/** 12 ranked clubs (descending ratio, no ties) + 2 ineligible. */
const twelve = (): EducationAwardRanking =>
  ranking({
    ranked: Array.from({ length: 12 }, (_, i) =>
      entry(i + 1, 24 - i, 20, i + 1)
    ),
    ineligible: [entry(90, 3, 5, null), entry(91, 0, 0, null)],
  })

const renderBoard = (
  awardsPerBase: EducationAwardRanking,
  membersWithAward: EducationAwardRanking = ranking(),
  isPriorProgramYear = false
) =>
  render(
    <MemoryRouter>
      <EducationAwardsLeaderboard
        rankings={{ awardsPerBase, membersWithAward }}
        districtId="61"
        isPriorProgramYear={isPriorProgramYear}
      />
    </MemoryRouter>
  )

const awardsCard = () =>
  screen.getByRole('region', { name: /education awards per base member/i })
const membersCard = () =>
  screen.getByRole('region', { name: /members with an education award/i })

const bodyRows = (container: HTMLElement) =>
  within(container)
    .getAllByRole('row')
    .filter(r => within(r).queryAllByRole('columnheader').length === 0)

describe('EducationAwardsLeaderboard (#1592)', () => {
  it('renders both cards with neutral titles and explanatory subtitles', () => {
    renderBoard(twelve())
    expect(awardsCard()).toHaveTextContent(
      /Pathways levels 1–5 \+ DTM earned this program year ÷ club's membership base/
    )
    expect(membersCard()).toHaveTextContent(
      /Distinct members who earned at least one award ÷ club's membership base/i
    )
  })

  it('shows only the top 10 ranked clubs until expanded', () => {
    renderBoard(twelve())
    const card = awardsCard()
    expect(bodyRows(card)).toHaveLength(10)
    expect(within(card).queryByText('Club 11')).not.toBeInTheDocument()
    expect(within(card).queryByText('Club 90')).not.toBeInTheDocument()
  })

  it('toggle reveals the full ranked list and the not-eligible group', async () => {
    const user = userEvent.setup()
    renderBoard(twelve())
    const card = awardsCard()
    const toggle = within(card).getByRole('button', {
      name: /show all 14 clubs/i,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(card).getByText('Club 12')).toBeInTheDocument()
    const ineligible = within(card).getByRole('table', {
      name: /not eligible \(base under 8\)/i,
    })
    expect(within(ineligible).getByText('Club 90')).toBeInTheDocument()
    expect(within(ineligible).getByText('Club 91')).toBeInTheDocument()
    // Ranked table now carries every ranked club
    const ranked = within(card).getByRole('table', { name: /ranked clubs/i })
    expect(bodyRows(ranked)).toHaveLength(12)

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(card).queryByText('Club 12')).not.toBeInTheDocument()
  })

  it('omits the toggle when everything already fits', () => {
    renderBoard(ranking({ ranked: [entry(1, 5, 10, 1)] }))
    expect(
      within(awardsCard()).queryByRole('button', { name: /show all/i })
    ).not.toBeInTheDocument()
  })

  it('displays shared ranks for ties (1, 1, 3)', () => {
    renderBoard(
      ranking({
        ranked: [entry(1, 5, 10, 1), entry(2, 5, 10, 1), entry(3, 4, 10, 3)],
      })
    )
    const rows = bodyRows(awardsCard())
    expect(within(rows[0]!).getAllByRole('cell')[0]).toHaveTextContent(
      /^=1 \(tied\)$/
    )
    expect(within(rows[1]!).getAllByRole('cell')[0]).toHaveTextContent(
      /^=1 \(tied\)$/
    )
    expect(within(rows[2]!).getAllByRole('cell')[0]).toHaveTextContent(/^3$/)
  })

  it('shows numerator / denominator and a 1-decimal percentage', () => {
    renderBoard(ranking({ ranked: [entry(1, 23, 18, 1)] }))
    const row = bodyRows(awardsCard())[0]!
    expect(row).toHaveTextContent('23 / 18')
    expect(row).toHaveTextContent('127.8%')
  })

  it('shows division/area and links the club to its detail page', () => {
    renderBoard(ranking({ ranked: [entry(1, 5, 10, 1)] }))
    const row = bodyRows(awardsCard())[0]!
    expect(within(row).getByRole('link', { name: 'Club 1' })).toHaveAttribute(
      'href',
      '/district/61/club/1001'
    )
    expect(row).toHaveTextContent('Div B · Area 12')
  })

  it('labels the daily report provenance with its as-of date', () => {
    renderBoard(ranking({ ranked: [entry(1, 5, 10, 1)] }))
    expect(awardsCard()).toHaveTextContent(
      'Source: TI Education Achievements report, as of October 01, 2026'
    )
  })

  it('labels the archive provenance for prior program years', () => {
    renderBoard(
      ranking({
        sourceReportType: 'education-archive',
        asOf: '',
        ranked: [entry(1, 5, 10, 1)],
      })
    )
    const card = awardsCard()
    expect(card).toHaveTextContent('Source: TI Educational Achievement Archive')
    expect(card).not.toHaveTextContent(/as of/)
  })

  it('explains a missing members ranking on a current-PY date as not-yet-available', () => {
    renderBoard(twelve(), ranking({ available: false }), false)
    const card = membersCard()
    expect(card).toHaveTextContent(
      "Member counts aren't available for this date yet — they start with newer snapshots."
    )
    expect(card).not.toHaveTextContent(/archive/i)
    expect(within(card).queryByRole('table')).not.toBeInTheDocument()
  })

  it('explains a missing members ranking on a prior-PY date via the archive', () => {
    renderBoard(twelve(), ranking({ available: false }), true)
    expect(membersCard()).toHaveTextContent(
      "Not available for this date — Toastmasters' archive for past years doesn't include member-level data."
    )
  })

  it('explains a missing awards ranking on a current-PY date', () => {
    renderBoard(ranking({ available: false }), ranking(), false)
    expect(awardsCard()).toHaveTextContent(
      'No education report available for this date.'
    )
  })

  it('points prior-PY viewers at the June 30 year-end snapshot when awards are missing', () => {
    renderBoard(ranking({ available: false }), ranking(), true)
    const card = awardsCard()
    expect(card).toHaveTextContent(
      'For past program years, this leaderboard is shown on the June 30 year-end snapshot.'
    )
    expect(card).not.toHaveTextContent(/No education report available/)
  })

  it('notes that award counts come from the education report, not DCP credit', () => {
    renderBoard(twelve())
    expect(awardsCard()).toHaveTextContent(
      /counts every award listed in Toastmasters' education report \(not DCP credit\), so totals can differ from the education levels card/i
    )
  })

  it('shows an empty state when no club is eligible', () => {
    renderBoard(ranking({ ineligible: [entry(90, 3, 5, null)] }))
    const card = awardsCard()
    expect(card).toHaveTextContent(
      /No clubs have a membership base of 8 or more/
    )
    expect(
      within(card).getByRole('button', { name: /show all 1 club/i })
    ).toBeInTheDocument()
  })
})
