/**
 * @vitest-environment jsdom
 *
 * SuccessPlanTargetsPanel (#2297): where a leader types the District Success
 * Plan targets that the `?targets=` link carries. Presentational — the page
 * owns the targets and the program year (R3) and writes the URL.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SuccessPlanTargetsPanel } from '../SuccessPlanTargetsPanel'
import { getProgramYear } from '../../utils/programYear'

const py = getProgramYear(2026)

const open = () => fireEvent.click(screen.getByText('Success Plan targets'))

const field = (name: RegExp) => screen.getByRole('textbox', { name })

afterEach(() => cleanup())

describe('SuccessPlanTargetsPanel (#2297)', () => {
  it('labels each field with the District Success Plan goal area', () => {
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={null}
        onChange={vi.fn()}
      />
    )
    open()
    expect(field(/Membership Payments Growth/)).toBeInTheDocument()
    expect(field(/Club Growth/)).toBeInTheDocument()
    expect(field(/Distinguished Clubs/)).toBeInTheDocument()
  })

  it('says the targets come from the link, not from TI', () => {
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={null}
        onChange={vi.fn()}
      />
    )
    open()
    expect(
      screen.getByText(/not from Toastmasters International/)
    ).toBeInTheDocument()
  })

  it('applies the typed targets for the page’s program year', () => {
    const onChange = vi.fn()
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={null}
        onChange={onChange}
      />
    )
    open()
    fireEvent.change(field(/Membership Payments Growth/), {
      target: { value: '4,500' },
    })
    fireEvent.change(field(/Club Growth/), { target: { value: '105' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith({
      programYear: 2026,
      goals: { payments: 4500, paidClubs: 105 },
    })
  })

  it('refuses an invalid number and says why', () => {
    const onChange = vi.fn()
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={null}
        onChange={onChange}
      />
    )
    open()
    const input = field(/Distinguished Clubs/)
    fireEvent.change(input, { target: { value: '-3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/whole number/)
  })

  it('applying with every field empty clears the targets', () => {
    const onChange = vi.fn()
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={null}
        onChange={onChange}
      />
    )
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('pre-fills the targets from the link and clears them', () => {
    const onChange = vi.fn()
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={{ programYear: 2026, goals: { payments: 4500 } }}
        onChange={onChange}
      />
    )
    open()
    expect(field(/Membership Payments Growth/)).toHaveValue('4500')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(field(/Membership Payments Growth/)).toHaveValue('')
  })

  it('says when the link’s targets are for another program year', () => {
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={{ programYear: 2025, goals: { payments: 4500 } }}
        onChange={vi.fn()}
      />
    )
    open()
    expect(screen.getByText(/2025-2026/)).toBeInTheDocument()
    expect(field(/Membership Payments Growth/)).toHaveValue('')
  })

  it('copies a link that carries the targets', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <SuccessPlanTargetsPanel
        programYear={py}
        targets={{ programYear: 2026, goals: { payments: 4500 } }}
        onChange={vi.fn()}
      />
    )
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('targets=p-4500_py-2026')
    )
    expect(
      await screen.findByText(/Anyone with it sees these targets/)
    ).toBeInTheDocument()
  })
})
