/**
 * Viewport-collision contract for the two shared tooltip panels (#1405).
 *
 * Both `Tooltip` (w-80 = 320px) and `InfoTooltip` (w-56 = 224px) render a
 * fixed-width panel centred on their trigger with no collision handling, so a
 * trigger near either viewport edge puts half the panel off-screen. Measured
 * on production before the fix: the Education Levels rows opened at
 * left −67 / −65 / −65 / −21, and the landing table-header tooltip ran to
 * right 432 at innerWidth 375.
 *
 * jsdom has no layout engine, so this file INSTALLS one: a
 * `getBoundingClientRect` stub that reports where a panel would really sit,
 * derived from the `--tooltip-shift` the component applies. That makes the
 * assertion the real one — "the panel's box is inside the viewport" — instead
 * of a className contract, while the rendered pixels are proven separately by
 * `e2e/tooltip-viewport-clip.smoke.ts`.
 *
 * A test that only asserted the tooltip is visible passes on `main`; these
 * fail there, at the edge that is actually clipped.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { Tooltip, InfoIcon } from '../Tooltip'
import InfoTooltip from '../InfoTooltip'

/** Panel widths the two components ask for (Tailwind w-80 / w-56). */
const TOOLTIP_PANEL_W = 320
const INFO_PANEL_W = 224

const VIEWPORT_W = 1024 // jsdom default innerWidth

let realGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect

/**
 * Stand in for a layout engine: report the panel at `unshiftedLeft` plus
 * whatever horizontal shift the component has applied to it.
 */
function installPanelLayout(unshiftedLeft: number, width: number): void {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.getAttribute('role') !== 'tooltip') {
      return realGetBoundingClientRect.call(this)
    }
    const shift =
      Number.parseFloat(this.style.getPropertyValue('--tooltip-shift')) || 0
    const left = unshiftedLeft + shift
    return {
      x: left,
      y: 0,
      left,
      right: left + width,
      top: 0,
      bottom: 40,
      width,
      height: 40,
      toJSON: () => ({}),
    } as DOMRect
  }
}

function panelBox(): DOMRect {
  return screen.getByRole('tooltip').getBoundingClientRect()
}

/** `Tooltip` wraps its children in the hover target; the icon is inside it,
 *  and `mouseover` bubbles up to the wrapper React listens on. */
function hoverIcon(container: HTMLElement): void {
  const icon = container.querySelector('svg')
  if (!icon) throw new Error('tooltip trigger icon did not render')
  fireEvent.mouseOver(icon)
}

function expectInsideViewport(where: string): void {
  const box = panelBox()
  expect(
    box.left,
    `${where}: panel starts at ${box.left} — its opening words are off-screen`
  ).toBeGreaterThanOrEqual(0)
  expect(
    box.right,
    `${where}: panel ends at ${box.right}, past the ${VIEWPORT_W}px viewport`
  ).toBeLessThanOrEqual(VIEWPORT_W)
}

beforeEach(() => {
  realGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
})

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = realGetBoundingClientRect
})

describe('Tooltip panel stays inside the viewport (#1405)', () => {
  it.each([
    { label: 'Level 1', left: -67 },
    { label: 'Level 2', left: -65 },
    { label: 'Level 3', left: -65 },
    { label: 'Level 4+ · Path · DTM', left: -21 },
  ])(
    'shifts the $label panel off the left edge and back into view',
    async ({ label, left }) => {
      installPanelLayout(left, TOOLTIP_PANEL_W)
      const { container } = render(
        <Tooltip content={`${label} description`} delay={0}>
          <InfoIcon />
        </Tooltip>
      )

      hoverIcon(container)
      await screen.findByRole('tooltip')

      expectInsideViewport(`left edge / ${label}`)
    }
  )

  it('pulls a right-clipped panel back inside', async () => {
    // Trigger near the right edge: centre − 160 leaves the panel 100px past it.
    installPanelLayout(VIEWPORT_W - TOOLTIP_PANEL_W + 100, TOOLTIP_PANEL_W)
    const { container } = render(
      <Tooltip content="Membership payments minus…" delay={0}>
        <InfoIcon />
      </Tooltip>
    )

    hoverIcon(container)
    await screen.findByRole('tooltip')

    expectInsideViewport('right edge')
  })

  it('leaves a panel that already fits exactly where it was', async () => {
    installPanelLayout(300, TOOLTIP_PANEL_W)
    const { container } = render(
      <Tooltip content="Comfortably centred" delay={0}>
        <InfoIcon />
      </Tooltip>
    )

    hoverIcon(container)
    const panel = await screen.findByRole('tooltip')

    expect(panel.getBoundingClientRect().left).toBe(300)
  })
})

describe('InfoTooltip panel stays inside the viewport (#1405)', () => {
  it('shifts a left-clipped panel back into view', () => {
    installPanelLayout(-90, INFO_PANEL_W)
    render(<InfoTooltip text="Paid Clubs = clubs that have met renewal…" />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: /info/i }))

    expectInsideViewport('InfoTooltip left edge')
  })

  it('pulls a right-clipped panel back inside (landing table header)', () => {
    installPanelLayout(VIEWPORT_W - 24, INFO_PANEL_W)
    render(<InfoTooltip text="Paid Clubs = clubs that have met renewal…" />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: /info/i }))

    expectInsideViewport('InfoTooltip right edge')
  })

  it('keeps the 44px WCAG 2.5.5 trigger floor untouched', () => {
    // The forbidden "fix" is to shrink the control until the panel fits. The
    // trigger must remain a plain <button>, which base.css floors at 44px —
    // no width/height utility may cap it (guarded live by
    // e2e/touch-targets.smoke.ts).
    render(<InfoTooltip text="Anything" />)
    const button = screen.getByRole('button', { name: /info/i })
    expect(button.tagName).toBe('BUTTON')
    expect(button.className).not.toMatch(/\b(w|h|max-w|max-h)-\d/)
  })
})
