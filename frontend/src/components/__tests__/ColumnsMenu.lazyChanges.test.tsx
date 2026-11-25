/**
 * #2740 review follow-ups for the Columns menu's lazy Changes group.
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { ColumnsMenu } from '../ColumnsMenu'
import { useColumnVisibility } from '../../hooks/useColumnVisibility'

const Harness: React.FC<{
  loading?: boolean
  failed?: boolean
  onRetry?: (() => void) | undefined
  onOpen?: (() => void) | undefined
}> = ({ loading = false, failed = false, onRetry, onOpen }) => {
  const columns = useColumnVisibility({
    tier: 'desktop',
    changesAvailable: true,
    sinceActive: false,
  })
  return (
    <ColumnsMenu
      columns={columns}
      changesAvailable
      changesLoading={loading}
      changesFailed={failed}
      onRetryChanges={onRetry}
      onOpen={onOpen}
    />
  )
}

afterEach(() => cleanup())

describe('ColumnsMenu lazy Changes group (#2740)', () => {
  it('keeps one status region mounted so loading text is announced', async () => {
    const { rerender } = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /^columns/i }))
    const region = screen.getByTestId('columns-changes-status')
    expect(region).toBeEmptyDOMElement()
    rerender(<Harness loading />)
    expect(screen.getByTestId('columns-changes-status')).toBe(region)
    expect(region).toHaveTextContent(/loading changes/i)
  })

  it('does not move focus when the parent passes a new onOpen each render', async () => {
    const { rerender } = render(<Harness onOpen={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /^columns/i }))
    const boxes = screen.getAllByRole('checkbox')
    const second = boxes.filter(b => !b.hasAttribute('disabled')).at(-1)!
    second.focus()
    rerender(<Harness onOpen={() => {}} />)
    expect(second).toHaveFocus()
  })

  it('calls onOpen once per open', async () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: /^columns/i }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('keeps the failed-load retry light, busy, single-flight, and focused', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(<Harness failed onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /^columns/i }))

    const retry = screen.getByRole('button', { name: /^try again$/i })
    expect(retry).toHaveClass(
      'underline',
      'text-sm',
      'min-h-[44px]',
      'text-[var(--tm-loyal-blue)]'
    )
    expect(retry).not.toHaveClass('tm-btn-secondary')

    await user.click(retry)
    expect(retry).toBeDisabled()
    expect(retry).toHaveAttribute('aria-busy', 'true')
    expect(retry).toHaveTextContent('Trying again…')
    await user.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)

    rerender(<Harness onRetry={onRetry} />)
    await waitFor(() => {
      const popover = document.getElementById(
        screen
          .getByRole('button', { name: /^columns/i })
          .getAttribute('aria-controls') ?? ''
      )
      expect(popover).toContainElement(document.activeElement as HTMLElement)
      expect(document.activeElement).not.toBe(document.body)
    })
  })
})
