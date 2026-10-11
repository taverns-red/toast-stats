import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ClubEducationPanel } from '../ClubEducationPanel'
import type { ClubEducationSummary } from '../../../utils/clubEducation'

/**
 * #1790 — Education panel on the club page (ledger only). Every number has
 * a text label next to it, so nothing relies on bar length or colour, and
 * nothing is hover-only (mobile-first, 375 px).
 */
const SUMMARY: ClubEducationSummary = {
  available: true,
  asOf: 'October 11, 2026',
  isArchive: false,
  total: 9,
  byProgram: { Pathways: 5, Legacy: 3, DTM: 1 },
  pathwaysLevels: [3, 1, 0, 0, 1],
  paths: [
    { code: 'PM', name: 'Presentation Mastery', count: 3 },
    { code: 'VC', name: 'Visionary Communication', count: 2 },
  ],
  membersWithAward: 3,
}

const renderPanel = (summary: ClubEducationSummary) =>
  render(<ClubEducationPanel summary={summary} programYearLabel="2026-2027" />)

describe('ClubEducationPanel', () => {
  it('shows totals, members with an award and DTMs', () => {
    renderPanel(SUMMARY)
    const panel = screen.getByRole('region', { name: 'Education' })
    expect(within(panel).getByText('Awards').nextSibling).toHaveTextContent('9')
    expect(
      within(panel).getByText('Members with an award').nextSibling
    ).toHaveTextContent('3')
    expect(within(panel).getByText('DTMs').nextSibling).toHaveTextContent('1')
  })

  it('labels the program split in text, not colour alone', () => {
    renderPanel(SUMMARY)
    const split = screen.getByRole('list', { name: 'Awards by program' })
    expect(split).toHaveTextContent('Pathways 5')
    expect(split).toHaveTextContent('Legacy 3')
    expect(split).toHaveTextContent('DTM 1')
  })

  it('lists Pathways levels 1–5 with counts and the paths worked on', () => {
    renderPanel(SUMMARY)
    const levels = screen.getByRole('list', {
      name: 'Pathways awards by level',
    })
    expect(within(levels).getAllByRole('listitem')).toHaveLength(5)
    expect(levels).toHaveTextContent('Level 1 3')
    expect(levels).toHaveTextContent('Level 5 1')
    const paths = screen.getByRole('list', { name: 'Paths' })
    expect(paths).toHaveTextContent('Presentation Mastery 3')
    expect(paths).toHaveTextContent('Visionary Communication 2')
  })

  it('states the ledger date', () => {
    renderPanel(SUMMARY)
    expect(screen.getByText(/as of october 11, 2026/i)).toBeInTheDocument()
  })

  it('names the year-end archive when the ledger is the archive', () => {
    renderPanel({
      ...SUMMARY,
      isArchive: true,
      asOf: '',
      membersWithAward: null,
    })
    expect(screen.getByText(/year-end archive/i)).toBeInTheDocument()
    expect(
      screen.getByText('Members with an award').nextSibling
    ).toHaveTextContent('—')
  })

  it('does not say "yet" for a completed year from the archive', () => {
    renderPanel({
      ...SUMMARY,
      isArchive: true,
      asOf: '',
      total: 0,
      byProgram: { Pathways: 0, Legacy: 0, DTM: 0 },
      pathwaysLevels: [0, 0, 0, 0, 0],
      paths: [],
      membersWithAward: null,
    })
    const note = screen.getByText(/no education awards recorded in 2026–2027/i)
    expect(note).not.toHaveTextContent(/yet/i)
  })

  it('says "not available" — never 0 — when the date has no ledger', () => {
    renderPanel({ available: false })
    const panel = screen.getByRole('region', { name: 'Education' })
    expect(panel).toHaveTextContent(/not available for this date/i)
    expect(panel).not.toHaveTextContent(/\b0\b/)
  })

  it('says no awards yet when the ledger exists but the club has none', () => {
    renderPanel({
      ...SUMMARY,
      total: 0,
      byProgram: { Pathways: 0, Legacy: 0, DTM: 0 },
      pathwaysLevels: [0, 0, 0, 0, 0],
      paths: [],
      membersWithAward: 0,
    })
    expect(
      screen.getByText(/no education awards recorded in 2026–2027/i)
    ).toBeInTheDocument()
  })
})
