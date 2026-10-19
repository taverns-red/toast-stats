import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ClubLifecyclePanel } from '../ClubLifecyclePanel'
import type { ClubLifecycle } from '../../../utils/clubLifecycle'

/**
 * #1843 — Lifecycle is a vertical timeline (mobile review §6.3): an ordered
 * list, one row per event (title + when), oldest first. The current district
 * is marked in words, not by the dot colour alone. While the history shard
 * loads, the panel holds a structural skeleton so the page below it does not
 * shift when it lands.
 */
const LIFECYCLE: ClubLifecycle = {
  events: [
    {
      key: 'charter',
      kind: 'charter',
      title: 'Chartered',
      when: 'Feb 1987',
      current: false,
    },
    {
      key: 'move-1-201',
      kind: 'move',
      title: 'Moved from District 1 to District 201',
      when: '2026–27 program year',
      current: true,
    },
  ],
  formerNames: [],
  historyAvailable: true,
  recordsStart: null,
}

// #2169 — club 5193: chartered before D80's first snapshot, never moved.
const PREDATES: ClubLifecycle = {
  events: [
    {
      key: 'charter',
      kind: 'charter',
      title: 'Chartered',
      when: 'Oct 2000',
      current: false,
    },
    {
      key: 'current-80',
      kind: 'current',
      title: 'In District 80',
      when: '',
      current: true,
    },
  ],
  formerNames: [],
  historyAvailable: true,
  recordsStart: '2016–17',
}

describe('ClubLifecyclePanel', () => {
  it('renders an ordered list, one item per event, oldest first', () => {
    render(<ClubLifecyclePanel lifecycle={LIFECYCLE} isLoading={false} />)
    const panel = screen.getByRole('region', { name: 'Lifecycle' })
    const list = within(panel).getByRole('list')
    expect(list.tagName).toBe('OL')
    const items = within(list).getAllByRole('listitem')
    expect(items.map(li => li.textContent)).toEqual([
      expect.stringContaining('Chartered'),
      expect.stringContaining('Moved from District 1 to District 201'),
    ])
    expect(items[0]).toHaveTextContent('Feb 1987')
  })

  it('names the current district in words', () => {
    render(<ClubLifecyclePanel lifecycle={LIFECYCLE} isLoading={false} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('2026–27 program year · Current')
    expect(items[0]).not.toHaveTextContent(/current/i)
    expect(items[1]).toHaveAttribute('aria-current', 'true')
  })

  it('a current-state row without a date reads "Current" alone (#2169)', () => {
    render(<ClubLifecyclePanel lifecycle={PREDATES} isLoading={false} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent(/^In District 80Current$/)
    expect(items[1]).toHaveAttribute('aria-current', 'true')
  })

  it('notes where our records start, under the timeline (#2169)', () => {
    render(<ClubLifecyclePanel lifecycle={PREDATES} isLoading={false} />)
    const note = screen.getByText('Our records start in 2016–17')
    expect(note).toHaveClass('club-lifecycle__note')
    expect(screen.getByRole('list').compareDocumentPosition(note)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    )
  })

  it('no records-start note for a club chartered inside our data (#2169)', () => {
    render(<ClubLifecyclePanel lifecycle={LIFECYCLE} isLoading={false} />)
    expect(screen.queryByText(/Our records start/)).toBeNull()
  })

  it('lists former names', () => {
    render(
      <ClubLifecyclePanel
        lifecycle={{
          ...LIFECYCLE,
          formerNames: ['Westlake Toastmasters Club'],
        }}
        isLoading={false}
      />
    )
    expect(screen.getByText(/Formerly/)).toHaveTextContent(
      'Formerly Westlake Toastmasters Club'
    )
  })

  it('says the district history is not available, keeping the charter row', () => {
    render(
      <ClubLifecyclePanel
        lifecycle={{
          events: [LIFECYCLE.events[0]!],
          formerNames: [],
          historyAvailable: false,
          recordsStart: null,
        }}
        isLoading={false}
      />
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(
      screen.getByText(/District history is not available/)
    ).toBeInTheDocument()
  })

  it('with nothing to show, says so instead of an empty list', () => {
    render(
      <ClubLifecyclePanel
        lifecycle={{
          events: [],
          formerNames: [],
          historyAvailable: false,
          recordsStart: null,
        }}
        isLoading={false}
      />
    )
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('holds a structural skeleton while loading, without event text', () => {
    render(<ClubLifecyclePanel lifecycle={null} isLoading={true} />)
    const panel = screen.getByRole('region', { name: 'Lifecycle' })
    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(
      panel.querySelectorAll('.club-lifecycle__row--skeleton').length
    ).toBeGreaterThanOrEqual(3)
  })
})
