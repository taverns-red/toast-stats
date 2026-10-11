import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { BottomSheet, SWIPE_CLOSE_PX } from '../BottomSheet'

afterEach(() => cleanup())

const Harness = ({ onClose = vi.fn() }: { onClose?: () => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <BottomSheet
        isOpen={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="District 61"
        closeLabel="Close page options"
      >
        <label>
          Program year
          <select defaultValue="a">
            <option value="a">A</option>
          </select>
        </label>
        <button type="button">Copy link</button>
      </BottomSheet>
    </>
  )
}

describe('BottomSheet (#1831)', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens as a modal dialog named by its title, focus on the close button', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'District 61' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(
      screen.getByRole('button', { name: 'Close page options' })
    ).toHaveFocus()
  })

  it('traps Tab inside the sheet (wraps last → first and first → last)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const close = screen.getByRole('button', { name: 'Close page options' })
    const last = screen.getByRole('button', { name: 'Copy link' })
    last.focus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('closes on Escape and returns focus to the opener', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('closes from the visible close button and from the backdrop', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Close page options' })
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByTestId('bottom-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes on a downward swipe of the handle, not on a short drag', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const handle = screen.getByTestId('bottom-sheet-handle')
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerUp(handle, { clientY: 500 + SWIPE_CLOSE_PX - 20 })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(handle, { clientY: 500 })
    fireEvent.pointerUp(handle, { clientY: 500 + SWIPE_CLOSE_PX })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('locks background scroll while open and restores it on close', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(document.body.style.overflow).toBe('')
  })
})
