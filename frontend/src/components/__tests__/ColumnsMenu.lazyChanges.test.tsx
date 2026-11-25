/**
 * #2740 review follow-ups for the Columns menu's lazy Changes group.
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { ColumnsMenu } from '../ColumnsMenu'
import { useColumnVisibility } from '../../hooks/useColumnVisibility'

const Harness: React.FC<{
  failed?: boolean
  loading?: boolean
  onOpen?: (() => void) | undefined
  onRetry?: (() => void) | undefined
}> = ({ failed = false, loading = false, onOpen, onRetry }) => {
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

  it('uses a light retry and keeps feedback and focus while retrying', async () => {
    const onRetry = vi.fn(() => new Promise<void>(() => {}))
    render(<Harness failed onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: /^columns/i }))

    const retry = screen.getByRole('button', { name: /try again/i })
    expect(retry).not.toHaveClass('tm-btn-secondary')
    expect(retry).toHaveClass('clubs-columns-menu__retry')
    await userEvent.click(retry)

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/loading changes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(document.activeElement).toBe(
      screen.getAllByRole('checkbox').find(box => !box.hasAttribute('disabled'))
    )
  })
})
