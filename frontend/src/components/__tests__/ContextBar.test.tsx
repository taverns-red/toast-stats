import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ContextBar, formatPyCompact } from '../ContextBar'
import { ContextSheetControls } from '../ContextSheetControls'
import { getProgramYear } from '../../utils/programYear'
import { snap } from '../../test-utils/snapshotDate'
import type { SnapshotDate } from '../../types/snapshotDate'

afterEach(() => cleanup())

const py2627 = getProgramYear(2026)
const py2526 = getProgramYear(2025)

const renderBar = (props: Partial<React.ComponentProps<typeof ContextBar>>) =>
  render(
    <MemoryRouter>
      <ContextBar
        title="District 61"
        programYear={py2627}
        date="2026-10-10"
        {...props}
      />
    </MemoryRouter>
  )

describe('ContextBar (#1831)', () => {
  it('formats the program year in the compact two-digit form', () => {
    expect(formatPyCompact(py2627)).toBe('PY 26–27')
  })

  it('renders one row: back crumb, entity name, and the PY · date chip', () => {
    renderBar({ back: { label: 'Districts', to: '/' } })
    const bar = screen.getByTestId('context-bar')
    const back = within(bar).getByRole('link', { name: 'Back to Districts' })
    expect(back).toHaveAttribute('href', '/')
    expect(bar).toHaveTextContent('District 61')
    expect(
      within(bar).getByRole('button', { name: /PY 26–27 · Oct 10/ })
    ).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('reads "Latest" when no date is being viewed yet', () => {
    renderBar({ date: undefined })
    expect(screen.getByTestId('context-bar-chip')).toHaveTextContent(
      'PY 26–27 · Latest'
    )
  })

  it('does not duplicate the page H1 for assistive tech (name is aria-hidden)', () => {
    renderBar({})
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByText('District 61')).toHaveAttribute(
      'aria-hidden',
      'true'
    )
  })

  it('opens a sheet with controls, actions, About this page and the full trail', async () => {
    renderBar({
      controls: <p>controls-slot</p>,
      actions: <button type="button">Export CSV</button>,
      about: 'Membership, payments and ranking.',
      trail: [
        { label: 'Districts', to: '/' },
        { label: 'District 61', to: '/district/61' },
        { label: 'Clubs' },
      ],
    })
    const chip = screen.getByTestId('context-bar-chip')
    expect(chip).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByRole('dialog', { name: 'District 61' })
    expect(chip).toHaveAttribute('aria-controls', sheet.id)
    expect(within(sheet).getByText('controls-slot')).toBeInTheDocument()
    expect(
      within(sheet).getByRole('button', { name: 'Export CSV' })
    ).toBeInTheDocument()
    expect(
      within(sheet).getByRole('heading', { name: 'About this page' })
    ).toBeInTheDocument()
    expect(
      within(sheet).getByText('Membership, payments and ranking.')
    ).toBeInTheDocument()
    const trail = within(sheet).getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(trail).getByRole('link', { name: 'Districts' })
    ).toHaveAttribute('href', '/')
    expect(within(trail).getByText('Clubs')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('Escape closes the sheet and returns focus to the chip', async () => {
    renderBar({})
    const chip = screen.getByTestId('context-bar-chip')
    await userEvent.click(chip)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(chip).toHaveFocus()
  })
})

describe('ContextSheetControls (#1831)', () => {
  const dates: SnapshotDate[] = [snap('2026-09-30'), snap('2026-10-10')]

  it('labels both selects and calls the page setters (R3, URL owned by the page)', async () => {
    const onPy = vi.fn()
    const onDate = vi.fn()
    render(
      <ContextSheetControls
        availableProgramYears={[py2627, py2526]}
        selectedProgramYear={py2627}
        onProgramYearChange={onPy}
        availableDates={dates}
        selectedDate={undefined}
        onDateChange={onDate}
        freshness="Data fresh · Oct 10, 2026"
      />
    )
    const py = screen.getByLabelText('Program year')
    const date = screen.getByLabelText('Snapshot date')
    expect(py).toHaveValue('2026')
    expect(date).toHaveValue('')
    // Newest date first, after "Latest in PY".
    expect(
      within(date)
        .getAllByRole('option')
        .map(o => o.textContent)
    ).toEqual(['Latest in PY', 'Oct 10, 2026', 'Sep 30, 2026'])

    await userEvent.selectOptions(py, '2025')
    expect(onPy).toHaveBeenCalledWith(py2526)
    await userEvent.selectOptions(date, '2026-09-30')
    expect(onDate).toHaveBeenCalledWith('2026-09-30')
    expect(screen.getByText('Data fresh · Oct 10, 2026')).toBeInTheDocument()
  })

  it('always offers the selected year, even before the index resolves', () => {
    render(
      <ContextSheetControls
        availableProgramYears={[]}
        selectedProgramYear={py2627}
        onProgramYearChange={vi.fn()}
        availableDates={[]}
        selectedDate={undefined}
        onDateChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Program year')).toHaveValue('2026')
  })
})
