import React, { useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useDialogBehavior } from '../useDialogBehavior'

/* The Tab trap wraps between the first and last *tabbable* element: not a
   tabindex=-1 link, a disabled control or a hidden one (#2638 review). */

const Probe: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null)
  useDialogBehavior({ active: true, onClose: () => {}, containerRef: ref })
  return (
    <div ref={ref}>
      <a href="#skip" tabIndex={-1}>
        skipped link
      </a>
      <button type="button">first</button>
      <button type="button">last</button>
      <button type="button" disabled>
        disabled
      </button>
      <button type="button" style={{ display: 'none' }}>
        hidden
      </button>
      <button type="button" hidden>
        hidden attribute
      </button>
    </div>
  )
}

describe('useDialogBehavior focus trap (#2638)', () => {
  afterEach(() => cleanup())

  it('Tab from the last tabbable element wraps to the first tabbable one', () => {
    render(<Probe />)
    const last = screen.getByRole('button', { name: 'last' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'first' })
    )
  })

  it('Shift+Tab from the first tabbable element wraps to the last tabbable one', () => {
    render(<Probe />)
    const first = screen.getByRole('button', { name: 'first' })
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'last' })
    )
  })
})
