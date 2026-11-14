import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DatePairPicker } from '../DatePairPicker'

/* #2475 — month-end revisions in the From/To picker. Revisions are listed
   under their month end ("Oct 31, 2026 · revised Nov 2"), newest first, in a
   labelled group. The chips and options stay native-select controls. */

const TOKENS = ['2026-10-30', '2026-10-31@2026-11-02', '2026-10-31']
const LABELS: Record<string, string> = {
  '2026-10-31@2026-11-02': 'Oct 31, 2026 · revised Nov 2',
  '2026-10-31': 'Oct 31, 2026 · revised Nov 3',
}
const GROUPS: Record<string, string> = {
  '2026-10-31@2026-11-02': 'Oct 31, 2026 revisions',
  '2026-10-31': 'Oct 31, 2026 revisions',
}

function renderPicker(onFromChange = vi.fn()) {
  render(
    <DatePairPicker
      dates={TOKENS}
      from="2026-10-31@2026-11-02"
      to="2026-10-31"
      onFromChange={onFromChange}
      onToChange={vi.fn()}
      labelFor={t => LABELS[t] ?? t}
      groupFor={t => GROUPS[t]}
    />
  )
  return onFromChange
}

describe('DatePairPicker — revisions (#2475)', () => {
  it('shows the revision label on the chip', () => {
    renderPicker()
    expect(screen.getByTestId('changes-from-chip')).toHaveTextContent(
      'Oct 31, 2026 · revised Nov 2'
    )
    expect(screen.getByTestId('changes-to-chip')).toHaveTextContent(
      'Oct 31, 2026 · revised Nov 3'
    )
  })

  it('lists the month end before its older revision, then older dates', () => {
    renderPicker()
    const opts = Array.from(
      screen.getByTestId('changes-from-chip-select').querySelectorAll('option')
    ).map(o => o.value)
    expect(opts).toEqual(['2026-10-31', '2026-10-31@2026-11-02', '2026-10-30'])
  })

  it('groups a month end and its revisions under one heading', () => {
    renderPicker()
    const group = screen
      .getByTestId('changes-from-chip-select')
      .querySelector('optgroup')
    expect(group).not.toBeNull()
    expect(group!.label).toBe('Oct 31, 2026 revisions')
    expect(within(group!).getAllByRole('option')).toHaveLength(2)
  })

  it('reports the picked revision token', async () => {
    const user = userEvent.setup()
    const onFromChange = renderPicker()
    await user.selectOptions(
      screen.getByTestId('changes-from-chip-select'),
      '2026-10-30'
    )
    expect(onFromChange).toHaveBeenCalledWith('2026-10-30')
  })
})
