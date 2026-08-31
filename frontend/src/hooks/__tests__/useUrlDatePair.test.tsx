import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useUrlDatePair } from '../useUrlDatePair'

/* #794 (epic #797 Sprint 2) — arbitrary date-pair picker, URL-synced.
   The hook reads ?from / ?to, validates them against the district's recorded
   dates, and falls back to the Phase-1 default (previous → latest) otherwise.
   from/to round-trip through the URL (R3 — the page owns the pair). */

const DATES = ['2026-05-20', '2026-05-22', '2026-05-25', '2026-05-26']

/** Renders the hook's state + buttons that drive its setters, plus the live
 *  search string so URL round-trips can be asserted directly. */
const Harness: React.FC<{ dates?: string[] }> = ({ dates = DATES }) => {
  const { from, to, setFrom, setTo } = useUrlDatePair(dates)
  const { search } = useLocation()
  return (
    <div>
      <span data-testid="from">{from ?? 'none'}</span>
      <span data-testid="to">{to ?? 'none'}</span>
      <span data-testid="search">{search}</span>
      <button onClick={() => setFrom('2026-05-22')}>from-22</button>
      <button onClick={() => setFrom('2026-05-25')}>from-default</button>
      <button onClick={() => setTo('2026-05-25')}>to-25</button>
      <button onClick={() => setTo('2026-05-26')}>to-default</button>
    </div>
  )
}

function renderAt(initialEntry: string, dates: string[] = DATES) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Harness dates={dates} />
    </MemoryRouter>
  )
}

describe('useUrlDatePair', () => {
  it('defaults to previous → latest when no params are present', () => {
    renderAt('/district/61/changes')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-25')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-05-26')
  })

  it('reads from/to out of the URL when both are present and valid', () => {
    renderAt('/district/61/changes?from=2026-05-20&to=2026-05-25')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-20')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-05-25')
  })

  it('ignores a URL date that is not in this district index (falls back)', () => {
    renderAt('/district/61/changes?from=2099-01-01&to=2026-05-25')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-25') // default
    expect(screen.getByTestId('to')).toHaveTextContent('2026-05-25')
  })

  it('writes a non-default selection into the URL (round-trip)', async () => {
    const user = userEvent.setup()
    renderAt('/district/61/changes')
    await user.click(screen.getByText('from-22'))
    expect(screen.getByTestId('search')).toHaveTextContent('from=2026-05-22')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-22')
  })

  it('deletes the param when the selection equals the default (clean URL)', async () => {
    const user = userEvent.setup()
    renderAt('/district/61/changes?from=2026-05-22')
    await user.click(screen.getByText('from-default'))
    expect(screen.getByTestId('search')).not.toHaveTextContent('from=')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-25')
  })

  it('returns undefined when fewer than two dates exist', () => {
    renderAt('/district/61/changes', ['2026-05-26'])
    expect(screen.getByTestId('from')).toHaveTextContent('none')
    expect(screen.getByTestId('to')).toHaveTextContent('none')
  })
})

/* #1462 (epic #1458 Sprint 4) — the preset chips set BOTH ends of the pair at
   once, so the hook needs a combined setter.

   Two sequential setFrom/setTo calls in one handler cannot express this:
   react-router resolves a functional updater against the params of the CURRENT
   render, not a queued previous update, so the second navigation rebuilds the
   query string from the pre-click params and discards the first key. The bug is
   invisible in the hook's return value (which reflects the new location) while
   being wrong in the URL — which is the thing that gets shared.
   (Lessons: "coupled URL params need one setter", "two URL-state hooks in one
   handler lose a facet".) */
describe('useUrlDatePair — setPair writes both ends in one navigation (#1462)', () => {
  /** Every `search` value this render tree ever observed, in order. */
  let observed: string[] = []

  const PairHarness: React.FC<{
    dates?: string[]
    pair: [string, string]
  }> = ({ dates = DATES, pair }) => {
    const { from, to, setPair } = useUrlDatePair(dates)
    const { search } = useLocation()
    observed.push(search)
    return (
      <div>
        <span data-testid="from">{from ?? 'none'}</span>
        <span data-testid="to">{to ?? 'none'}</span>
        <span data-testid="search">{search}</span>
        <button onClick={() => setPair(pair[0], pair[1])}>set-pair</button>
      </div>
    )
  }

  function renderPairAt(
    initialEntry: string,
    pair: [string, string],
    dates: string[] = DATES
  ) {
    observed = []
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <PairHarness dates={dates} pair={pair} />
      </MemoryRouter>
    )
  }

  it('lands both from and to in the URL from a single call', async () => {
    const user = userEvent.setup()
    renderPairAt('/district/61/changes', ['2026-05-20', '2026-05-25'])
    await user.click(screen.getByText('set-pair'))

    expect(screen.getByTestId('search')).toHaveTextContent('from=2026-05-20')
    expect(screen.getByTestId('search')).toHaveTextContent('to=2026-05-25')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-20')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-05-25')
  })

  it('never renders an intermediate half-pair URL', async () => {
    const user = userEvent.setup()
    renderPairAt('/district/61/changes', ['2026-05-20', '2026-05-25'])
    await user.click(screen.getByText('set-pair'))

    // Both ends are non-default here, so any observed search carrying exactly
    // one of them is a dropped key — the two-call failure shape.
    const halfPair = observed.filter(s => {
      const params = new URLSearchParams(s)
      return (
        (params.has('from') || params.has('to')) &&
        !(params.has('from') && params.has('to'))
      )
    })
    expect(halfPair).toEqual([])
  })

  it('deletes both params when the pair equals the default (clean URL)', async () => {
    const user = userEvent.setup()
    renderPairAt('/district/61/changes?from=2026-05-20&to=2026-05-22', [
      '2026-05-25',
      '2026-05-26',
    ])
    await user.click(screen.getByText('set-pair'))

    expect(screen.getByTestId('search')).not.toHaveTextContent('from=')
    expect(screen.getByTestId('search')).not.toHaveTextContent('to=')
    expect(screen.getByTestId('from')).toHaveTextContent('2026-05-25')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-05-26')
  })

  it('writes only the non-default end when the other end is the default', async () => {
    const user = userEvent.setup()
    // to = the latest date = the default, so only from earns a param.
    renderPairAt('/district/61/changes', ['2026-05-20', '2026-05-26'])
    await user.click(screen.getByText('set-pair'))

    expect(screen.getByTestId('search')).toHaveTextContent('from=2026-05-20')
    expect(screen.getByTestId('search')).not.toHaveTextContent('to=')
    expect(screen.getByTestId('to')).toHaveTextContent('2026-05-26')
  })

  it('preserves unrelated params (deep links stay intact)', async () => {
    const user = userEvent.setup()
    renderPairAt('/district/61/changes?expandChanges=membership', [
      '2026-05-20',
      '2026-05-25',
    ])
    await user.click(screen.getByText('set-pair'))

    expect(screen.getByTestId('search')).toHaveTextContent(
      'expandChanges=membership'
    )
    expect(screen.getByTestId('search')).toHaveTextContent('from=2026-05-20')
  })

  it('bails on a no-op so it cannot churn history (Lesson 070)', async () => {
    const user = userEvent.setup()
    renderPairAt('/district/61/changes?from=2026-05-20&to=2026-05-25', [
      '2026-05-20',
      '2026-05-25',
    ])
    const before = observed.length
    await user.click(screen.getByText('set-pair'))
    expect(observed.length).toBe(before)
  })
})
