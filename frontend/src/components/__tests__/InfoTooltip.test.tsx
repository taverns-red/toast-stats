/**
 * Unit tests for InfoTooltip component (#92, #2644)
 *
 * Verifies:
 * - The trigger is a named toggle button ("About <label>"), never "info"
 * - Tooltip text shows on hover/focus and hides again
 * - The trigger points at the tooltip with aria-describedby while it is open
 * - Click/Enter toggles it (touch and keyboard), Escape closes it (WCAG 1.4.13)
 */

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import InfoTooltip from '../InfoTooltip'

const trigger = () => screen.getByRole('button', { name: 'About paid clubs' })

describe('InfoTooltip (#92, #2644)', () => {
  it('names its trigger from the label it is given', () => {
    render(<InfoTooltip label="paid clubs" text="Some explanation" />)

    expect(trigger()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'info' })).toBeNull()
  })

  it('exposes the open state with aria-expanded', () => {
    render(<InfoTooltip label="paid clubs" text="Some explanation" />)

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.mouseEnter(trigger())
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('should show tooltip text on hover', () => {
    render(<InfoTooltip label="paid clubs" text="This is the explanation" />)

    fireEvent.mouseEnter(trigger())

    expect(screen.getByText('This is the explanation')).toBeVisible()
  })

  it('should hide tooltip when mouse leaves', () => {
    render(<InfoTooltip label="paid clubs" text="This is the explanation" />)

    fireEvent.mouseEnter(trigger())
    expect(screen.getByText('This is the explanation')).toBeVisible()

    fireEvent.mouseLeave(trigger())
    expect(
      screen.queryByText('This is the explanation')
    ).not.toBeInTheDocument()
  })

  it('should show tooltip on focus for keyboard accessibility', () => {
    render(<InfoTooltip label="paid clubs" text="Accessible tooltip" />)

    fireEvent.focus(trigger())

    expect(screen.getByText('Accessible tooltip')).toBeVisible()
  })

  it('ties the tooltip text to the trigger with aria-describedby', () => {
    render(<InfoTooltip label="paid clubs" text="Linked text" />)

    fireEvent.focus(trigger())

    const tip = screen.getByRole('tooltip')
    expect(tip.id).not.toBe('')
    expect(trigger()).toHaveAttribute('aria-describedby', tip.id)
  })

  it('closes on Escape without moving focus', () => {
    render(<InfoTooltip label="paid clubs" text="Dismiss me" />)

    act(() => trigger().focus())
    expect(screen.getByText('Dismiss me')).toBeVisible()

    fireEvent.keyDown(trigger(), { key: 'Escape' })

    expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('toggles on click so a touch tap can open and close it', () => {
    render(<InfoTooltip label="paid clubs" text="Tap text" />)

    // A touch tap fires focus, then click.
    fireEvent.focus(trigger())
    fireEvent.click(trigger())
    expect(screen.getByText('Tap text')).toBeVisible()

    fireEvent.click(trigger())
    expect(screen.queryByText('Tap text')).not.toBeInTheDocument()
  })

  it('keeps a tapped tooltip open after the pointer leaves', () => {
    render(<InfoTooltip label="paid clubs" text="Pinned text" />)

    fireEvent.mouseEnter(trigger())
    fireEvent.click(trigger())
    fireEvent.mouseLeave(trigger())

    expect(screen.getByText('Pinned text')).toBeVisible()
  })

  // Safari does not focus a button on click, so onBlur never fires there.
  it('closes a pinned tooltip on a pointer press outside it', () => {
    render(
      <div>
        <InfoTooltip label="paid clubs" text="Outside text" />
        <p>elsewhere</p>
      </div>
    )

    fireEvent.mouseEnter(trigger())
    fireEvent.click(trigger())
    fireEvent.mouseLeave(trigger())
    expect(screen.getByText('Outside text')).toBeVisible()

    fireEvent.pointerDown(screen.getByText('elsewhere'))

    expect(screen.queryByText('Outside text')).not.toBeInTheDocument()
  })

  it('keeps a pinned tooltip open on a press inside the panel or trigger', () => {
    render(<InfoTooltip label="paid clubs" text="Inside text" />)

    fireEvent.click(trigger())
    fireEvent.pointerDown(screen.getByText('Inside text'))
    fireEvent.pointerDown(trigger())

    expect(screen.getByText('Inside text')).toBeVisible()
  })
})
