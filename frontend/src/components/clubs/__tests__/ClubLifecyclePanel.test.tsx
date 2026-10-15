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
      key: 'first-01',
      kind: 'first',
      title: 'First record in District 1',
      when: '2016–17 program year',
      current: false,
    },
    {
      key: 'move-201',
      kind: 'move',
      title: 'Moved to District 201',
      when: '2026–27 program year',
      current: true,
    },
  ],
  formerNames: [],
  historyAvailable: true,
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
      expect.stringContaining('First record in District 1'),
      expect.stringContaining('Moved to District 201'),
    ])
    expect(items[0]).toHaveTextContent('Feb 1987')
  })

  it('names the current district in words', () => {
    render(<ClubLifecyclePanel lifecycle={LIFECYCLE} isLoading={false} />)
    const items = screen.getAllByRole('listitem')
    expect(items[2]).toHaveTextContent(/current/i)
    expect(items[0]).not.toHaveTextContent(/current/i)
    expect(items[2]).toHaveAttribute('aria-current', 'true')
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
        lifecycle={{ events: [], formerNames: [], historyAvailable: false }}
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
