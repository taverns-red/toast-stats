/* /methodology regrouped by reader question (#2656, decision D1).

   - the page is titled "How it works" to match the nav label;
   - the jump list groups sections under plain-language questions;
   - on a phone the accordion is the one contents list (no second card);
   - every pre-regroup section anchor still resolves, and following one on
     desktop keeps the hash and never writes ?openSections (REF-05). */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'

const mockIsMobile = vi.fn()
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobile(),
}))

import MethodologyPage from '../MethodologyPage'
import { PROGRAM_YEAR_RULE_CHANGES } from '../../content/programYearRuleChanges'

// Every section id that existed before the regroup. Shared links use these.
const LEGACY_SECTION_IDS = [
  'data-source',
  'refresh-cadence',
  'borda-count',
  'regions-borda',
  'dcp-tiers',
  'club-health',
  'district-membership-trend',
  'glossary',
  'caveats',
  'program-year-rule-changes',
  'worldwide-rollup',
  'club-race',
  'officer-training',
  'member-data',
  'region-recognition',
  'council-voting-strength',
  'club-growth-prospective',
  'success-plan-targets',
  'distinguished-club-counts',
  'changelog',
]

const EXPECTED_GROUPS: ReadonlyArray<{
  name: string
  ids: ReadonlyArray<string>
}> = [
  {
    name: 'Where do the numbers come from?',
    ids: ['data-source', 'refresh-cadence', 'member-data', 'caveats'],
  },
  {
    name: 'How are districts and clubs scored?',
    ids: [
      'borda-count',
      'regions-borda',
      'dcp-tiers',
      'club-health',
      'distinguished-club-counts',
      'region-recognition',
      'district-membership-trend',
    ],
  },
  {
    name: 'What do the worldwide and growth pages show?',
    ids: [
      'worldwide-rollup',
      'club-race',
      'club-growth-prospective',
      'success-plan-targets',
    ],
  },
  {
    name: 'How do councils and training work?',
    ids: ['council-voting-strength', 'officer-training'],
  },
  {
    name: 'What do the words mean, and what changed?',
    ids: ['glossary', 'program-year-rule-changes', 'changelog'],
  },
]

const LocationProbe: React.FC = () => {
  const loc = useLocation()
  return (
    <div data-testid="loc">
      {loc.pathname}
      {loc.search}
      {loc.hash}
    </div>
  )
}

const renderAt = (url = '/methodology') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <MethodologyPage />
      <LocationProbe />
    </MemoryRouter>
  )

describe('How it works — naming', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false))

  // The nav label itself ("How it works" -> /methodology) is already pinned by
  // AppShell.test.tsx; the page heading and tab title must agree with it.
  it('titles the page "How it works"', () => {
    renderAt()
    expect(
      screen.getByRole('heading', { level: 1, name: /^how it works$/i })
    ).toBeInTheDocument()
    expect(document.title).toBe('How it works — Toast Stats')
  })
})

describe('How it works — grouped jump list (desktop)', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(false))

  it('groups the 20 sections under five question headings, in order', () => {
    renderAt()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    const groups = within(toc).getAllByRole('group')
    expect(groups.map(g => g.getAttribute('aria-label') ?? '')).toEqual(
      EXPECTED_GROUPS.map(g => g.name)
    )
    groups.forEach((group, i) => {
      const hrefs = within(group)
        .getAllByRole('link')
        .map(a => a.getAttribute('href'))
      expect(hrefs).toEqual(EXPECTED_GROUPS[i].ids.map(id => `#${id}`))
    })
  })

  it('lists each section exactly once and puts the sections in the same order in the body', () => {
    renderAt()
    const expected = EXPECTED_GROUPS.flatMap(g => g.ids)
    expect(expected).toHaveLength(20)
    expect([...expected].sort()).toEqual([...LEGACY_SECTION_IDS].sort())
    const bodyOrder = Array.from(
      document.querySelectorAll('section.methodology-section')
    ).map(s => s.id)
    expect(bodyOrder).toEqual(expected)
  })

  it('numbers the sections 01-20 in reading order', () => {
    renderAt()
    const nums = Array.from(
      document.querySelectorAll('.methodology-section__num')
    ).map(n => n.textContent)
    expect(nums).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'))
    )
  })
})

describe('How it works — phone has one contents list', () => {
  beforeEach(() => mockIsMobile.mockReturnValue(true))

  it('does not render the "On this page" card on a phone', () => {
    renderAt()
    expect(
      screen.queryByRole('navigation', { name: /on this page/i })
    ).not.toBeInTheDocument()
    const toggles = screen
      .getAllByRole('button')
      .filter(b => b.getAttribute('aria-expanded') !== null)
    expect(toggles).toHaveLength(20)
  })

  it('shows the group question above each run of accordions', () => {
    renderAt()
    for (const g of EXPECTED_GROUPS) {
      expect(screen.getByText(g.name)).toBeInTheDocument()
    }
  })

  it('groups the Jump to sheet the same way', async () => {
    renderAt()
    await userEvent.click(screen.getByRole('button', { name: /jump to/i }))
    const dialog = screen.getByRole('dialog')
    const groups = within(dialog).getAllByRole('group')
    expect(groups.map(g => g.getAttribute('aria-label') ?? '')).toEqual(
      EXPECTED_GROUPS.map(g => g.name)
    )
  })
})

describe('How it works — old section anchors still resolve (#2656)', () => {
  it.each(LEGACY_SECTION_IDS)(
    'desktop: /methodology#%s keeps its element, its hash and writes no ?openSections',
    id => {
      mockIsMobile.mockReturnValue(false)
      renderAt(`/methodology#${id}`)
      expect(document.getElementById(id)).not.toBeNull()
      const loc = screen.getByTestId('loc').textContent || ''
      expect(loc).toBe(`/methodology#${id}`)
    }
  )

  it.each(LEGACY_SECTION_IDS)(
    'phone: /methodology#%s opens that section',
    id => {
      mockIsMobile.mockReturnValue(true)
      renderAt(`/methodology#${id}`)
      const section = document.getElementById(id) as HTMLElement
      expect(section).not.toBeNull()
      expect(
        within(section).getAllByRole('button')[0].getAttribute('aria-expanded')
      ).toBe('true')
    }
  )

  it('rule-change entry anchors still resolve', () => {
    mockIsMobile.mockReturnValue(false)
    const entry = PROGRAM_YEAR_RULE_CHANGES[0]
    renderAt(`/methodology#${entry.id}`)
    expect(document.getElementById(entry.id)).not.toBeNull()
    expect(screen.getByTestId('loc').textContent).toBe(
      `/methodology#${entry.id}`
    )
  })

  it('desktop: clicking a jump-list link writes no ?openSections and keeps the hash', async () => {
    mockIsMobile.mockReturnValue(false)
    renderAt()
    const toc = screen.getByRole('navigation', { name: /on this page/i })
    await userEvent.click(within(toc).getByRole('link', { name: /Glossary/ }))
    await userEvent.click(within(toc).getByRole('link', { name: /Changelog/ }))
    const loc = screen.getByTestId('loc').textContent || ''
    expect(loc).not.toContain('openSections')
  })
})
