/* /methodology — program-year rule-change log (#1400).

   Toastmasters moves the recognition rules between program years and the app
   already encodes several of those moves; this section is what tells the
   reader. The contract under test:
     - every logged change is rendered, grouped by program year, newest first
     - each entry is deep-linkable at `/methodology#<id>` — a shared link
       expands the section (mobile) and the entry itself carries the anchor
     - an unknown `#py-…` fragment is a no-op (same whitelist chokepoint the
       section ids go through, Lesson 144). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  PROGRAM_YEAR_RULE_CHANGES,
  ruleChangesByProgramYear,
} from '../../content/programYearRuleChanges'

const mockIsMobile = vi.fn()
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
}))

import MethodologyPage from '../MethodologyPage'

const renderAt = (url = '/methodology') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <MethodologyPage />
    </MemoryRouter>
  )

describe('MethodologyPage — program-year rule changes (#1400)', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false))

  it('renders the section and links it from the TOC', () => {
    renderAt()
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /program-year rule change/i,
      })
    ).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: /on this page/i })
    expect(
      within(nav).getByRole('link', { name: /program-year rule change/i })
    ).toBeInTheDocument()
  })

  it('renders every logged change with its metric and comparability impact', () => {
    renderAt()
    for (const change of PROGRAM_YEAR_RULE_CHANGES) {
      const entry = document.getElementById(change.id)
      expect(entry, `missing anchor for ${change.id}`).not.toBeNull()
      const text = entry?.textContent || ''
      expect(text).toContain(change.title)
      expect(text).toContain(change.affects)
      expect(text).toContain(change.comparability)
    }
  })

  it('groups entries by program year, newest year first', () => {
    renderAt()
    const groups = ruleChangesByProgramYear()
    for (const group of groups) {
      expect(
        screen.getByRole('heading', {
          level: 3,
          name: new RegExp(`program year ${group.programYear}`, 'i'),
        })
      ).toBeInTheDocument()
    }
    // DOM order matches the log's own newest-first order.
    const rendered = PROGRAM_YEAR_RULE_CHANGES.map(c =>
      document.getElementById(c.id)
    )
    for (let i = 1; i < rendered.length; i++) {
      const previous = rendered[i - 1]!
      const current = rendered[i]!
      expect(
        previous.compareDocumentPosition(current) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }
  })

  it('gives every entry a copyable permalink to its own anchor', () => {
    renderAt()
    for (const change of PROGRAM_YEAR_RULE_CHANGES) {
      const entry = document.getElementById(change.id)!
      const permalink = within(entry).getByRole('link', {
        name: new RegExp(change.title.slice(0, 24), 'i'),
      })
      expect(permalink).toHaveAttribute('href', `#${change.id}`)
    }
  })
})

describe('MethodologyPage — rule-change deep links (#1400)', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(true))

  it('expands the rule-change section when an entry anchor is shared', () => {
    const target = PROGRAM_YEAR_RULE_CHANGES[0]!
    renderAt(`/methodology#${target.id}`)
    const toggle = screen.getByRole('button', {
      name: /program-year rule change/i,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(target.comparability)).toBeVisible()
  })

  it('ignores an unknown rule-change fragment (no phantom expand)', () => {
    renderAt('/methodology#py-9999-0000-not-a-real-change')
    const open = screen
      .getAllByRole('button')
      .filter(b => b.getAttribute('aria-expanded') === 'true')
    expect(open).toHaveLength(0)
  })
})
