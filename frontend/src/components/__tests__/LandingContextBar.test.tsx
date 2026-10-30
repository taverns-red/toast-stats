/* Landing context bar (#1846, mobile epic #1827 Phase 2, review §7 item 19).
   Below 768 the landing's header stack (title, lede, the 4-line orientation
   paragraph, freshness/PY/date chips, Export/Share) is what put the first KPI
   at y=532. The phone gets the shared ContextBar instead; the orientation
   copy, the PY/date controls and the page actions move into its sheet. */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LandingContextBar } from '../LandingContextBar'
import { getProgramYear } from '../../utils/programYear'
import { snap } from '../../test-utils/snapshotDate'
import { USER_PICK } from '../../hooks/useUrlProgramYear'

afterEach(() => cleanup())

const py = getProgramYear(2026)

const renderBar = (
  over: Partial<React.ComponentProps<typeof LandingContextBar>> = {}
) => {
  const props: React.ComponentProps<typeof LandingContextBar> = {
    selectedProgramYear: py,
    setSelectedProgramYear: vi.fn(),
    availableProgramYears: [py, getProgramYear(2025)],
    cachedDates: [snap('2026-10-09'), snap('2026-10-10')],
    selectedDate: undefined,
    setSelectedDate: vi.fn(),
    effectiveDate: snap('2026-10-10'),
    asOfDate: '2026-10-10',
    isLatestSnapshot: true,
    orientation: 'Each row below is one of the 94 Toastmasters districts.',
    onExportCsv: vi.fn(),
    ...over,
  }
  render(
    <MemoryRouter>
      <LandingContextBar {...props} />
    </MemoryRouter>
  )
  return props
}

describe('LandingContextBar (#1846)', () => {
  it('names the page and shows the PY · date chip, with no back crumb (root page)', () => {
    renderBar()
    const bar = screen.getByTestId('context-bar')
    // #2249 — the bar replaces the header on phones. #2256 — the H1's full
    // text needs ~242px in the ~208px title slot at 375 and ellipsised, so
    // the bar shows a shorter phone title; the H1 itself is unchanged.
    const title = bar.querySelector('.context-bar__title')!
    expect(title).toHaveTextContent(/^Find a district$/)
    expect(title).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('context-bar-chip')).toHaveTextContent(
      'PY 26–27 · Oct 10'
    )
    expect(screen.queryByTestId('context-bar-back')).toBeNull()
  })

  it('moves the orientation copy into the sheet (the lede stays on the page)', async () => {
    renderBar()
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    const sheet = screen.getByRole('dialog')
    expect(sheet).not.toHaveTextContent(/compare district performance/i)
    expect(sheet).toHaveTextContent(
      'Each row below is one of the 94 Toastmasters districts.'
    )
  })

  it('puts the PY and date controls in the sheet, wired to the page setters (R3)', async () => {
    const props = renderBar()
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    await userEvent.selectOptions(
      screen.getByTestId('context-sheet-py'),
      '2025'
    )
    expect(props.setSelectedProgramYear).toHaveBeenCalledWith(
      getProgramYear(2025),
      USER_PICK
    )
    await userEvent.selectOptions(
      screen.getByTestId('context-sheet-date'),
      '2026-10-09'
    )
    expect(props.setSelectedDate).toHaveBeenCalledWith('2026-10-09', USER_PICK)
  })

  it('lists Export CSV and Copy link as sheet actions', async () => {
    const props = renderBar()
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    const sheet = screen.getByRole('dialog')
    await userEvent.click(
      within(sheet).getByRole('button', { name: 'Export CSV' })
    )
    expect(props.onExportCsv).toHaveBeenCalledTimes(1)
    expect(
      within(sheet).getByRole('button', { name: 'Copy link' })
    ).toBeInTheDocument()
  })

  it('omits Export CSV while there is nothing to export (loading shell)', async () => {
    renderBar({ onExportCsv: undefined })
    await userEvent.click(screen.getByTestId('context-bar-chip'))
    const sheet = screen.getByRole('dialog')
    expect(
      within(sheet).queryByRole('button', { name: 'Export CSV' })
    ).toBeNull()
    expect(
      within(sheet).getByRole('button', { name: 'Copy link' })
    ).toBeInTheDocument()
  })
})
