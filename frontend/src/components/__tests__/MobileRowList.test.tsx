/**
 * MobileRowList (#1833, mobile epic #1827 Phase 1) — the compact row primitive
 * for browse-one-entity data on phones (review §5.2): line 1 = name + status
 * chip, line 2 = two or three key numbers, a chevron, and the WHOLE row is one
 * link to the entity's routed page. Groups are collapsed by default with
 * counts; long lists show 50 rows then "Show 25 more".
 *
 * jsdom proves structure and behaviour; row height and chip clipping are
 * geometry, proven by the CSS contract below and on the live preview by
 * bounding box (Lesson 134).
 */
import type { ReactElement } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  render as rtlRender,
  screen,
  cleanup,
  fireEvent,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { MobileRowList, type MobileRow } from '../MobileRowList'

afterEach(cleanup)

const render = (ui: ReactElement) =>
  rtlRender(<MemoryRouter>{ui}</MemoryRouter>)

const makeRows = (n: number, prefix = 'Club'): MobileRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    to: `/district/61/club/${prefix}-${i}`,
    title: `${prefix} ${i}`,
    chip: <span data-testid="chip">✓ Thriving</span>,
    meta: `${i} members`,
  }))

describe('MobileRowList — flat rows', () => {
  it('renders each row as ONE link to its routed page carrying name, chip and meta', () => {
    render(<MobileRowList label="Clubs" rows={makeRows(2)} noun="clubs" />)
    const list = screen.getByRole('list', { name: 'Clubs' })
    const links = within(list).getAllByRole('link')
    expect(links).toHaveLength(2)
    const first = links[0]!
    expect(first).toHaveAttribute('href', '/district/61/club/Club-0')
    expect(first).toHaveTextContent('Club 0')
    expect(first).toHaveTextContent('✓ Thriving')
    expect(first).toHaveTextContent('0 members')
    // The chip and meta live INSIDE the link — no nested interactive controls.
    expect(within(first).getByTestId('chip')).toBeInTheDocument()
    expect(first.querySelectorAll('a, button')).toHaveLength(0)
  })

  // #1968 — a short flag (e.g. "Coach") rides line 1 right after the name,
  // so line 2 (chip + numbers) keeps its full width at 375 px.
  it('renders a title badge on line 1, after the name', () => {
    render(
      <MobileRowList
        label="Clubs"
        rows={[
          {
            ...makeRows(1)[0]!,
            badge: <span data-testid="badge">Coach</span>,
          },
        ]}
      />
    )
    const link = screen.getByRole('link')
    const line1 = link.querySelector('.mobile-row__line1')!
    const badge = line1.querySelector('.mobile-row__badge')
    expect(badge).not.toBeNull()
    expect(badge).toHaveTextContent('Coach')
    expect(line1.firstElementChild).toHaveClass('mobile-row__title')
    expect(link.querySelector('.mobile-row__line2')).not.toHaveTextContent(
      'Coach'
    )
  })

  it('renders no badge wrapper when a row has none', () => {
    render(<MobileRowList label="Clubs" rows={makeRows(1)} />)
    expect(document.querySelector('.mobile-row__badge')).toBeNull()
  })

  // #1843 — an off-site row (a club's own website) opens in a new tab and
  // says so; it is still one whole-row link with the chevron.
  it('renders an external row as a new-tab anchor with an accessible hint', () => {
    render(
      <MobileRowList
        label="More"
        rows={[
          {
            id: 'site',
            to: 'https://7238597.toastmastersclubs.org/',
            title: 'Club website',
            external: true,
          },
        ]}
      />
    )
    const link = screen.getByRole('link', {
      name: 'Club website (opens in a new tab)',
    })
    expect(link).toHaveAttribute(
      'href',
      'https://7238597.toastmastersclubs.org/'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('data-testid', 'mobile-row')
  })

  it('shows the first 50 rows, then "Show 25 more" reveals 25 at a time', () => {
    render(<MobileRowList label="Clubs" rows={makeRows(80)} noun="clubs" />)
    const list = screen.getByRole('list', { name: 'Clubs' })
    expect(within(list).getAllByRole('link')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: /show 25 more clubs/i }))
    expect(within(list).getAllByRole('link')).toHaveLength(75)
    // Only 5 left: the button says so, then disappears once all are shown.
    fireEvent.click(screen.getByRole('button', { name: /show 5 more clubs/i }))
    expect(within(list).getAllByRole('link')).toHaveLength(80)
    expect(screen.queryByRole('button', { name: /show .* more/i })).toBeNull()
  })

  it('has no "show more" control at or under 50 rows', () => {
    render(<MobileRowList label="Clubs" rows={makeRows(50)} noun="clubs" />)
    expect(screen.queryByRole('button', { name: /show .* more/i })).toBeNull()
  })
})

describe('MobileRowList — layout options', () => {
  it("chipPlacement='meta' moves the chip to line 2 so a long name keeps line 1", () => {
    const { container } = render(
      <MobileRowList
        label="Clubs"
        rows={makeRows(1)}
        noun="clubs"
        chipPlacement="meta"
      />
    )
    const line1 = container.querySelector('.mobile-row__line1')!
    const line2 = container.querySelector('.mobile-row__line2')!
    expect(line1).toHaveTextContent(/^Club 0$/)
    expect(within(line2 as HTMLElement).getByTestId('chip')).toBeInTheDocument()
    expect(line2).toHaveTextContent('0 members')
  })

  it('flush drops the side chrome so rows can bleed to the panel edge', () => {
    const { container } = render(
      <MobileRowList label="Clubs" rows={makeRows(1)} noun="clubs" flush />
    )
    expect(container.querySelector('.mobile-row-list--flush')).not.toBeNull()
  })
})

describe('MobileRowList — groups', () => {
  const groups = [
    { id: 'A', label: 'Division A', rows: makeRows(3, 'A'), summary: '✗ 1' },
    { id: 'B', label: 'Division B', rows: makeRows(2, 'B') },
  ]

  it('collapses every group by default, with the row count in the toggle', () => {
    render(<MobileRowList label="Clubs" groups={groups} noun="clubs" />)
    const a = screen.getByRole('button', { name: /Division A/ })
    expect(a).toHaveAttribute('aria-expanded', 'false')
    expect(a).toHaveTextContent('3')
    expect(a).toHaveTextContent('✗ 1')
    expect(
      screen.getByRole('button', { name: /Division B/ })
    ).toHaveTextContent('2')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('toggles a group open and closed when uncontrolled', () => {
    render(<MobileRowList label="Clubs" groups={groups} noun="clubs" />)
    const a = screen.getByRole('button', { name: /Division A/ })
    fireEvent.click(a)
    expect(a).toHaveAttribute('aria-expanded', 'true')
    const region = document.getElementById(a.getAttribute('aria-controls')!)!
    expect(within(region).getAllByRole('link')).toHaveLength(3)
    fireEvent.click(a)
    expect(a).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('is controlled by openGroupIds / onToggleGroup (URL-owned state)', () => {
    const onToggleGroup = vi.fn()
    render(
      <MobileRowList
        label="Clubs"
        groups={groups}
        noun="clubs"
        openGroupIds={['B']}
        onToggleGroup={onToggleGroup}
      />
    )
    expect(screen.getByRole('button', { name: /Division B/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Division A/ }))
    expect(onToggleGroup).toHaveBeenCalledWith('A')
    // Controlled: the parent owns the open set, so nothing opens on its own.
    expect(screen.getByRole('button', { name: /Division A/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})

describe('MobileRowList CSS contract (review §5.2 / §5.6)', () => {
  const css = readFileSync(
    resolve(__dirname, '../../styles/components/mobile-row-list.css'),
    'utf-8'
  ).replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (sel: string): string => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`(^|[}\\s])${esc}\\s*\\{([^}]*)\\}`).exec(css)
    if (!m || m[2] === undefined) throw new Error(`rule not found: ${sel}`)
    return m[2]
  }
  const px = (block: string, prop: string): number => {
    const m = new RegExp(`(^|[;\\s])${prop}\\s*:\\s*(\\d+)px`).exec(block)
    if (!m) throw new Error(`${prop} not set in px`)
    return Number(m[2])
  }

  // The PR #1871 preview overflowed the Action List by 120 px at 375 in a
  // desktop-engine viewport: nowrap titles/meta set the list's min-content
  // width, and a min-content-sized ancestor grew to fit. Inline-size
  // containment makes the list's intrinsic width ignore its content, so the
  // ellipsis engages instead of the page widening.
  it('the list never widens its ancestors (inline-size containment)', () => {
    const root = rule('.mobile-row-list')
    expect(root).toMatch(/contain:\s*inline-size/)
  })

  it('rows are 56–64 px tall', () => {
    const row = rule('.mobile-row')
    expect(px(row, 'min-height')).toBeGreaterThanOrEqual(56)
    expect(px(row, 'max-height')).toBeLessThanOrEqual(64)
  })

  it('group toggles and show-more are ≥ 44 px tap targets', () => {
    expect(
      px(rule('.mobile-row-group__toggle'), 'min-height')
    ).toBeGreaterThanOrEqual(44)
    expect(
      px(rule('.mobile-row-list__more'), 'min-height')
    ).toBeGreaterThanOrEqual(44)
  })

  it('every text line is ≥ 14 px', () => {
    for (const sel of [
      '.mobile-row__title',
      '.mobile-row__meta',
      '.mobile-row-group__label',
      '.mobile-row-group__count',
      '.mobile-row-list__more',
      // The shared status pill is 11 px elsewhere; in a row it is data (§5.6).
      '.mobile-row__chip .clubs-status-pill',
      '.mobile-row__badge',
      '.mobile-chip',
    ]) {
      expect(px(rule(sel), 'font-size'), sel).toBeGreaterThanOrEqual(14)
    }
  })

  it('a title badge never shrinks or wraps either (#1968)', () => {
    const badge = rule('.mobile-row__badge')
    expect(badge).toMatch(/flex-shrink:\s*0/)
    expect(badge).toMatch(/white-space:\s*nowrap/)
  })

  it('the chip never shrinks or wraps — the title ellipsizes instead (Lesson 134)', () => {
    const chip = rule('.mobile-row__chip')
    expect(chip).toMatch(/flex-shrink:\s*0/)
    expect(chip).toMatch(/white-space:\s*nowrap/)
    const title = rule('.mobile-row__title')
    expect(title).toMatch(/text-overflow:\s*ellipsis/)
    expect(title).toMatch(/min-width:\s*0/)
  })
})
