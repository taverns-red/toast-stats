import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'
import { DatePairPresetChips } from '../DatePairPresetChips'

expect.extend(toHaveNoViolations)

/* #1462 (epic #1458 Sprint 4) — one-tap time windows for the "What Changed"
   date-pair picker. The chips are pure derivations over the recorded dates the
   page already loaded; each reports a resolved pair up in ONE call (the page
   owns the state, R3). A window with no recorded date to anchor it renders
   disabled rather than silently selecting a date with no snapshot. */

// A daily-ish history: 05-26 is latest; a week back lands on 05-19 exactly, a
// month back targets 04-26 → nearest recorded at or before is 04-20; the
// program year (PY 2025-26, opened 2025-07-01) starts at 2025-07-10.
const DATES = [
  '2025-07-10',
  '2026-04-20',
  '2026-05-19',
  '2026-05-25',
  '2026-05-26',
]

function renderChips(over: Partial<Parameters<typeof DatePairPresetChips>[0]>) {
  const onSelect = vi.fn()
  const result = render(
    <DatePairPresetChips
      dates={DATES}
      from="2026-05-25"
      to="2026-05-26"
      onSelect={onSelect}
      {...over}
    />
  )
  return { onSelect, ...result }
}

describe('DatePairPresetChips', () => {
  it('renders one chip per time window, in display order', () => {
    renderChips({})
    const names = screen
      .getAllByRole('button')
      .map(b => b.querySelector('[data-chip-label]')?.textContent)
    expect(names).toEqual([
      'Last snapshot',
      '~1 week',
      '~1 month',
      'Program year',
    ])
  })

  it('uses toggle buttons, never tabs — nothing swaps a panel (Lesson 128)', () => {
    renderChips({})
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed')
      expect(button).toHaveAttribute('type', 'button')
    }
  })

  it('reports the resolved pair for "~1 month" in a single onSelect call', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderChips({})
    await user.click(screen.getByTestId('changes-preset-month'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('2026-04-20', '2026-05-26')
  })

  it('reports the program-year opening snapshot for "Program year"', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderChips({})
    await user.click(screen.getByTestId('changes-preset-program-year'))
    expect(onSelect).toHaveBeenCalledWith('2025-07-10', '2026-05-26')
  })

  it('marks the chip matching the current pair as pressed, and only that one', () => {
    // The default pair (previous → latest) IS the "Last snapshot" window.
    renderChips({})
    expect(screen.getByTestId('changes-preset-last-snapshot')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const pressed = screen
      .getAllByRole('button')
      .filter(b => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(1)
  })

  it('moves the pressed state when the page hands it a different pair', () => {
    renderChips({ from: '2026-05-19', to: '2026-05-26' })
    expect(screen.getByTestId('changes-preset-week')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByTestId('changes-preset-last-snapshot')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('presses nothing for a hand-picked pair that matches no window', () => {
    renderChips({ from: '2026-04-20', to: '2026-05-25' })
    const pressed = screen
      .getAllByRole('button')
      .filter(b => b.getAttribute('aria-pressed') === 'true')
    expect(pressed).toHaveLength(0)
  })

  it('disables a window with no recorded date to anchor it', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderChips({
      dates: ['2026-05-25', '2026-05-26'],
      from: '2026-05-25',
      to: '2026-05-26',
    })
    const week = screen.getByTestId('changes-preset-week')
    expect(week).toBeDisabled()
    expect(screen.getByTestId('changes-preset-month')).toBeDisabled()
    expect(screen.getByTestId('changes-preset-last-snapshot')).toBeEnabled()
    // Both dates fall inside PY 2025-26, so "Program year" honestly resolves to
    // the same pair — two windows describing one comparison, both true.
    expect(screen.getByTestId('changes-preset-program-year')).toBeEnabled()

    await user.click(week)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('explains a disabled window rather than leaving a dead chip', () => {
    renderChips({
      dates: ['2026-05-25', '2026-05-26'],
      from: '2026-05-25',
      to: '2026-05-26',
    })
    expect(screen.getByTestId('changes-preset-week')).toHaveTextContent(
      /not enough recorded history/i
    )
  })

  it('names each chip with its visible label plus what it will compare', () => {
    renderChips({})
    // WCAG 2.5.3 — the accessible name must start with the visible text, so
    // voice control ("click ~1 week") still works.
    const week = screen.getByTestId('changes-preset-week')
    expect(week.textContent).toMatch(/^~1 week/)
    expect(week).toHaveTextContent(/nearest recorded date/i)
  })

  it('holds the 44px touch-target floor on every chip', () => {
    renderChips({})
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('min-h-[44px]')
    }
  })

  it('renders nothing when the district has too little history for any window', () => {
    renderChips({ dates: ['2026-05-26'], from: undefined, to: undefined })
    expect(screen.queryByTestId('changes-preset-chips')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderChips({})
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations with disabled chips present', async () => {
    const { container } = renderChips({
      dates: ['2026-05-25', '2026-05-26'],
      from: '2026-05-25',
      to: '2026-05-26',
    })
    expect(await axe(container)).toHaveNoViolations()
  })
})
