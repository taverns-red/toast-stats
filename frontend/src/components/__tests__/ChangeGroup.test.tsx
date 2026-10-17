import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChangeGroup } from '../ChangeGroup'
import type { DiffEvent } from '@taverns-red/shared-contracts'

/* Unit test for the District "What Changed" feed group (#1013, epic #1007).
   Every club-scoped change line links the club name to that club's detail page
   (/district/:districtId/club/:clubId). A club-less event (empty clubId) still
   renders as plain text — no broken/empty link. Tested directly, no page mount
   (R22); districtId is passed as a prop (R3), clubId comes from the event. */

const renderGroup = (events: DiffEvent[], districtId = '61') =>
  render(
    <MemoryRouter>
      <ChangeGroup
        category="membership"
        heading="Membership changes"
        events={events}
        districtId={districtId}
        collapsed={false}
        onToggle={() => {}}
      />
    </MemoryRouter>
  )

const event = (over: Partial<DiffEvent> = {}): DiffEvent => ({
  category: 'membership',
  clubId: '123',
  clubName: 'Acme Club',
  label: 'Acme Club gained 5 members',
  magnitude: 5,
  ...over,
})

describe('ChangeGroup club links (#1013)', () => {
  it('links the club name to its detail page for a club-scoped event', () => {
    renderGroup([event()], '61')

    const link = screen.getByRole('link', { name: /Acme Club/ })
    expect(link).toHaveAttribute('href', '/district/61/club/123')
    // The prose remainder stays as text; only the name is the link.
    expect(screen.getByText(/gained 5 members/)).toBeInTheDocument()
  })

  it('renders plain text with no link for a district-level (club-less) event', () => {
    renderGroup(
      [
        event({
          clubId: '',
          clubName: '',
          label: 'District membership shifted by 5',
        }),
      ],
      '61'
    )

    expect(
      screen.getByText('District membership shifted by 5')
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('builds the href from the districtId prop, not from event data (R3)', () => {
    renderGroup(
      [
        event({
          clubId: '999',
          clubName: 'Beta Club',
          label: 'Beta Club lost 2 members',
        }),
      ],
      '42'
    )

    expect(screen.getByRole('link', { name: /Beta Club/ })).toHaveAttribute(
      'href',
      '/district/42/club/999'
    )
  })

  it('links the roster-move label whose name is followed by a "(Active)" suffix', () => {
    renderGroup(
      [
        event({
          category: 'club-added',
          clubId: '28680300',
          clubName: 'iA Montreal Toastmasters',
          label: 'iA Montreal Toastmasters (Active) joined the roster',
        }),
      ],
      '61'
    )

    const link = screen.getByRole('link', { name: /iA Montreal Toastmasters/ })
    expect(link).toHaveAttribute('href', '/district/61/club/28680300')
    expect(screen.getByText(/joined the roster/)).toBeInTheDocument()
  })

  it('renders nothing when the group has no events', () => {
    const { container } = renderGroup([])
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ChangeGroup area/division links (#1014)', () => {
  it('links a division-status entity to its scoped division route', () => {
    renderGroup(
      [
        event({
          category: 'division-status',
          clubId: '',
          clubName: '',
          divisionId: 'G',
          entityName: 'Division G',
          label: 'Division G moved to Select Distinguished',
        }),
      ],
      '61'
    )

    const link = screen.getByRole('link', { name: /Division G/ })
    expect(link).toHaveAttribute('href', '/district/61/division/G')
    expect(
      screen.getByText(/moved to Select Distinguished/)
    ).toBeInTheDocument()
  })

  it('links an area-status entity to its division-scoped area route', () => {
    renderGroup(
      [
        event({
          category: 'area-status',
          clubId: '',
          clubName: '',
          divisionId: 'B',
          areaId: '2',
          entityName: 'Area 2',
          label: 'Area 2 moved to Confirmed Distinguished',
        }),
      ],
      '61'
    )

    const link = screen.getByRole('link', { name: /Area 2/ })
    expect(link).toHaveAttribute('href', '/district/61/division/B/area/2')
    expect(
      screen.getByText(/moved to Confirmed Distinguished/)
    ).toBeInTheDocument()
  })

  it('renders an area entity as plain text when its division ref is missing', () => {
    renderGroup(
      [
        event({
          category: 'area-status',
          clubId: '',
          clubName: '',
          areaId: '2',
          entityName: 'Area 2',
          label: 'Area 2 lost Distinguished status',
        }),
      ],
      '61'
    )

    expect(
      screen.getByText('Area 2 lost Distinguished status')
    ).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

/* #1463 (epic #1458 Sprint 5) — signed net-delta in the group heading.

   21 of D61's 38 membership events over a month are ±1 rows, so a bare count
   forces the reader to sum the whole group to answer "are we up or down?".
   The net is derived from the SAME events the group renders (never a parallel
   computation), and only for the categories whose `magnitude` is a real signed
   quantity — membership, payments, dcp-goals. For the roster/recognition
   categories `magnitude` is a ±1 direction FLAG, so a "net" there would be a
   fabricated statistic; those headings keep the count alone. */

const renderCategory = (
  category: DiffEvent['category'],
  heading: string,
  events: DiffEvent[]
) =>
  render(
    <MemoryRouter>
      <ChangeGroup
        category={category}
        heading={heading}
        events={events}
        districtId="61"
        collapsed={false}
        onToggle={() => {}}
      />
    </MemoryRouter>
  )

describe('ChangeGroup net delta (#1463)', () => {
  it('renders a signed positive net for the membership group', () => {
    renderCategory('membership', 'Membership changes', [
      event({
        clubId: '1',
        clubName: 'A',
        label: 'A gained 5 members',
        magnitude: 5,
      }),
      event({
        clubId: '2',
        clubName: 'B',
        label: 'B gained 14 members',
        magnitude: 14,
      }),
      event({
        clubId: '3',
        clubName: 'C',
        label: 'C lost 2 members',
        magnitude: -2,
      }),
    ])

    const net = screen.getByTestId('changes-group-net')
    expect(net).toHaveTextContent(/net \+17\b/)
    // Direction is never colour alone (WCAG 1.4.1): sign + a screen-reader word.
    expect(net).toHaveTextContent(/increase/)
    // The count is still there, unchanged.
    expect(screen.getByTestId('changes-group-count')).toHaveTextContent('3')
  })

  it('renders a negative net with a U+2212 minus, never a hyphen', () => {
    renderCategory('membership', 'Membership changes', [
      event({
        clubId: '1',
        clubName: 'A',
        label: 'A lost 6 members',
        magnitude: -6,
      }),
      event({
        clubId: '2',
        clubName: 'B',
        label: 'B gained 2 members',
        magnitude: 2,
      }),
    ])

    const net = screen.getByTestId('changes-group-net')
    expect(net.textContent).toContain('net −4')
    expect(net.textContent).not.toContain('-4')
    expect(net).toHaveTextContent(/decrease/)
  })

  it('renders an explicit unsigned "net 0" for a non-empty group that nets out', () => {
    renderCategory('membership', 'Membership changes', [
      event({
        clubId: '1',
        clubName: 'A',
        label: 'A gained 3 members',
        magnitude: 3,
      }),
      event({
        clubId: '2',
        clubName: 'B',
        label: 'B lost 3 members',
        magnitude: -3,
      }),
    ])

    const net = screen.getByTestId('changes-group-net')
    // A zero net is a real answer, not something to hide — and it must never
    // be signed, so "+0"/"−0" can't be confused with a tiny real movement.
    expect(net.textContent).toMatch(/net 0(?!\d)/)
    expect(net.textContent).not.toContain('+0')
    expect(net.textContent).not.toContain('−0')
    expect(net.textContent).not.toContain('-0')
  })

  it('renders a net for the payments group (#1459)', () => {
    renderCategory('payments', 'Payment changes', [
      event({
        category: 'payments',
        clubId: '1',
        clubName: 'A',
        label: 'A added 7 payments',
        magnitude: 7,
      }),
      event({
        category: 'payments',
        clubId: '2',
        clubName: 'B',
        label: 'B added 3 payments',
        magnitude: 3,
      }),
    ])

    expect(screen.getByTestId('changes-group-net')).toHaveTextContent(
      /net \+10\b/
    )
  })

  it('renders a net for the dcp-goals group', () => {
    renderCategory('dcp-goals', 'DCP goal changes', [
      event({
        category: 'dcp-goals',
        clubId: '1',
        clubName: 'A',
        label: 'A gained 2 DCP goals',
        magnitude: 2,
      }),
    ])

    expect(screen.getByTestId('changes-group-net')).toHaveTextContent(
      /net \+2\b/
    )
  })

  it.each([
    ['club-added', 'Clubs that joined'],
    ['club-removed', 'Clubs that left'],
    ['club-transferred-in', 'Clubs moved in (district realignment)'],
    ['club-transferred-out', 'Clubs moved out (district realignment)'],
    ['club-status', 'Club status changes'],
    ['distinguished', 'Distinguished status changes'],
    ['division-status', 'Division status changes'],
    ['area-status', 'Area status changes'],
  ] as const)(
    'omits the net for %s — its magnitude is a direction flag, not a quantity',
    (category, heading) => {
      renderCategory(category, heading, [
        event({
          category,
          clubId: '1',
          clubName: 'A',
          label: 'A changed',
          magnitude: 1,
        }),
        event({
          category,
          clubId: '2',
          clubName: 'B',
          label: 'B changed',
          magnitude: -1,
        }),
      ])

      expect(screen.queryByTestId('changes-group-net')).not.toBeInTheDocument()
      expect(screen.getByTestId('changes-group-count')).toHaveTextContent('(2)')
    }
  )
})

describe('ChangeGroup transfer counterpart (#1806)', () => {
  const renderTransfer = (
    category: 'club-transferred-in' | 'club-transferred-out',
    label: string,
    districtId: string,
    counterparts?: ReadonlyMap<string, string>
  ) =>
    render(
      <MemoryRouter>
        <ChangeGroup
          category={category}
          heading="Clubs moved"
          events={[
            event({
              category,
              clubId: '00000977',
              clubName: 'Professional Women Toastmasters',
              label,
              magnitude: category === 'club-transferred-in' ? 1 : -1,
            }),
          ]}
          districtId={districtId}
          collapsed={false}
          onToggle={() => {}}
          {...(counterparts ? { counterparts } : {})}
        />
      </MemoryRouter>
    )

  // The labels are the exact strings diffSnapshots' transferLabel emits.
  const OUT =
    'Professional Women Toastmasters (Active) moved to another district in the 2026 district realignment'
  const IN =
    'Professional Women Toastmasters (Active) moved into the district in the 2026 district realignment'

  it('names and links the district a club transferred to', () => {
    const { container } = renderTransfer(
      'club-transferred-out',
      OUT,
      '01',
      new Map([['977', '201']])
    )
    const link = screen.getByRole('link', { name: 'District 201' })
    expect(link).toHaveAttribute('href', '/district/201')
    expect(container.querySelector('li')?.textContent).toBe(
      'Professional Women Toastmasters (Active) transferred to District 201 in the 2026 district realignment'
    )
  })

  it('names and links the district a club transferred from', () => {
    const { container } = renderTransfer(
      'club-transferred-in',
      IN,
      '201',
      new Map([['977', '01']])
    )
    expect(screen.getByRole('link', { name: 'District 01' })).toHaveAttribute(
      'href',
      '/district/01'
    )
    expect(container.querySelector('li')?.textContent).toBe(
      'Professional Women Toastmasters (Active) transferred from District 01 in the 2026 district realignment'
    )
  })

  it('leaves the label unchanged when the history has no counterpart', () => {
    const { container } = renderTransfer('club-transferred-out', OUT, '01')
    expect(container.querySelector('li')?.textContent).toBe(OUT)
    expect(
      screen.queryByRole('link', { name: /^District / })
    ).not.toBeInTheDocument()
  })

  it('ignores a counterpart for a non-transfer event', () => {
    render(
      <MemoryRouter>
        <ChangeGroup
          category="club-removed"
          heading="Clubs that left"
          events={[
            event({
              category: 'club-removed',
              clubId: '977',
              label: 'Acme Club (Active) left the district',
              magnitude: -1,
            }),
          ]}
          districtId="01"
          collapsed={false}
          onToggle={() => {}}
          counterparts={new Map([['977', '201']])}
        />
      </MemoryRouter>
    )
    expect(
      screen.queryByRole('link', { name: /^District / })
    ).not.toBeInTheDocument()
  })
})

/* #2063 — the counterpart lookup loads a bounded batch of history shards per
   view. A transfer row whose shard is still outside the batch is "deferred":
   it keeps the engine's wording, and the group offers to load the next batch. */
describe('ChangeGroup deferred counterparts (#2063)', () => {
  const transfers = (category: DiffEvent['category'], ids: string[]) =>
    ids.map(id =>
      event({
        category,
        clubId: id,
        clubName: `Club ${id}`,
        label: `Club ${id} (Active) moved into the district in the 2026 district realignment`,
        magnitude: 1,
      })
    )

  const renderDeferred = (
    category: DiffEvent['category'],
    events: DiffEvent[],
    deferred: ReadonlySet<string>,
    onLoadMore = vi.fn()
  ) => {
    render(
      <MemoryRouter>
        <ChangeGroup
          category={category}
          heading="Clubs moved in"
          events={events}
          districtId="36"
          collapsed={false}
          onToggle={() => {}}
          deferredCounterparts={deferred}
          onLoadMoreCounterparts={onLoadMore}
        />
      </MemoryRouter>
    )
    return onLoadMore
  }

  it('offers to name the other district for the deferred rows in this group', () => {
    const onLoadMore = renderDeferred(
      'club-transferred-in',
      transfers('club-transferred-in', ['00000101', '102', '103']),
      // '999' belongs to another group: it is not counted here.
      new Set(['101', '103', '999'])
    )
    const button = screen.getByRole('button', {
      name: 'Name the other district for 2 more clubs',
    })
    fireEvent.click(button)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('uses the singular for one deferred club', () => {
    renderDeferred(
      'club-transferred-out',
      transfers('club-transferred-out', ['101']),
      new Set(['101'])
    )
    expect(
      screen.getByRole('button', {
        name: 'Name the other district for 1 more club',
      })
    ).toBeInTheDocument()
  })

  it('shows no button when nothing in the group is deferred', () => {
    renderDeferred(
      'club-transferred-in',
      transfers('club-transferred-in', ['101']),
      new Set(['999'])
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows no button on a non-transfer group', () => {
    renderDeferred(
      'club-removed',
      transfers('club-removed', ['101']),
      new Set(['101'])
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
