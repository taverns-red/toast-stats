/* /methodology mobile disclosure (#877, epic #880 Sprint 1).

   At <768px each H2 section collapses by default and expands on tap; the
   in-page TOC anchor links expand their target section. Desktop is
   unaffected (covered by MethodologyPage.test.tsx + the desktop case below,
   where useIsMobile() is false). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mockIsMobile = vi.fn()
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
}))

import MethodologyPage from '../MethodologyPage'

const renderPage = () =>
  render(
    <MemoryRouter>
      <MethodologyPage />
    </MemoryRouter>
  )

describe('MethodologyPage — mobile collapsed sections', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(true))

  it('renders every H2 section as a disclosure button, collapsed by default', () => {
    renderPage()
    // 20 sections → 20 toggle buttons, all collapsed. The rule-change
    // entries inside the Program-year rule changes section are anchors, not
    // disclosures, so they add no toggles.
    const toggles = screen
      .getAllByRole('button')
      .filter(b => b.getAttribute('aria-expanded') !== null)
    expect(toggles).toHaveLength(20)
    expect(
      toggles.every(b => b.getAttribute('aria-expanded') === 'false')
    ).toBe(true)
    // A body-only string is present in the DOM but not visible while collapsed.
    expect(
      screen.getByText(/weights all three categories equally/i)
    ).not.toBeVisible()
  })

  it('expands a section when its heading toggle is tapped', async () => {
    renderPage()
    const btn = screen.getByRole('button', { name: /Borda count scoring/i })
    await userEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(/weights all three categories equally/i)
    ).toBeVisible()
  })

  // The in-page "On this page" card is desktop-only now (#2656): on a phone the
  // accordion list above is the contents list, and the Jump to chip below is
  // its shortcut. See MethodologyPage.groups.test.tsx for the absence check.
})

describe('MethodologyPage — sticky Jump-to chip (#878)', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(true))

  it('renders the sticky "Jump to" chip on mobile', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /jump to/i })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    )
  })

  it('opens a sheet and expands the chosen section when its sheet link is tapped', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /jump to/i }))
    const dialog = screen.getByRole('dialog')
    // Jump to a section that is collapsed by default.
    await userEvent.click(
      within(dialog).getByRole('link', { name: /Borda count scoring/i })
    )
    // Sheet closed and the target section is now expanded.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /Borda count scoring/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('MethodologyPage — desktop unaffected', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false))

  it('renders no disclosure toggles and shows all bodies', () => {
    renderPage()
    const toggles = screen
      .queryAllByRole('button')
      .filter(b => b.getAttribute('aria-expanded') !== null)
    expect(toggles).toHaveLength(0)
    expect(
      screen.getByText(/weights all three categories equally/i)
    ).toBeVisible()
  })
})
