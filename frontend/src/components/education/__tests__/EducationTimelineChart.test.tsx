/* #2592 — the Education timeline chart: a stacked cumulative STEP chart in the
   Clubs RaceChart's grammar. Recharts is mocked (the RaceChart.test pattern)
   so the assertions are about the data, the stack and the labels, not SVG
   geometry. */

import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { EducationTimelineChart } from '../EducationTimelineChart'
import {
  DISTRICT_61_TIMELINE,
  MONTH_GRAIN_TIMELINE,
  NO_PRIOR_TIMELINE,
} from '../../../__tests__/fixtures/educationTimelineFixtures'

vi.mock('recharts', () => ({
  ComposedChart: ({
    children,
    data,
  }: {
    children: React.ReactNode
    data: unknown
  }) => (
    <div data-testid="chart" data-series={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: ({
    dataKey,
    stackId,
    type,
    isAnimationActive,
    className,
  }: {
    dataKey: string
    stackId?: string
    type?: string
    isAnimationActive?: boolean
    className?: string
  }) => (
    <div
      data-testid="area"
      data-key={dataKey}
      data-stack={stackId}
      data-type={type}
      data-animated={isAnimationActive ? 'true' : 'false'}
      className={className}
    />
  ),
  Line: ({
    dataKey,
    name,
    type,
    connectNulls,
    isAnimationActive,
  }: {
    dataKey: string
    name?: string
    type?: string
    connectNulls?: boolean
    isAnimationActive?: boolean
  }) => (
    <div
      data-testid="line"
      data-key={dataKey}
      data-name={name}
      data-type={type}
      data-connect-nulls={String(connectNulls === true)}
      data-animated={isAnimationActive ? 'true' : 'false'}
    />
  ),
  XAxis: ({
    type,
    scale,
    domain,
    ticks,
  }: {
    type?: string
    scale?: string
    domain?: unknown
    ticks?: unknown
  }) => (
    <div
      data-testid="x-axis"
      data-type={type}
      data-scale={scale}
      data-domain={JSON.stringify(domain)}
      data-ticks={JSON.stringify(ticks)}
    />
  ),
  YAxis: ({
    width,
    domain,
    ticks,
  }: {
    width?: number
    domain?: unknown
    ticks?: unknown
  }) => (
    <div
      data-testid="y-axis"
      data-width={width}
      data-domain={JSON.stringify(domain)}
      data-ticks={JSON.stringify(ticks)}
    />
  ),
  ReferenceLine: ({
    y,
    className,
    label,
  }: {
    y?: number
    className?: string
    label?: { value?: string } | string
  }) => (
    <div
      data-testid="reference-line"
      data-y={y}
      className={className}
      data-label={typeof label === 'string' ? label : label?.value}
    />
  ),
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

const matchMedia = (reduce: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', matchMedia(false))
  window.matchMedia = matchMedia(false) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type Row = Record<string, number | string | boolean | null>
const data = (): Row[] =>
  JSON.parse(screen.getByTestId('chart').getAttribute('data-series') || '')
/** The artifact's own points: the display-only tail is not one. */
const points = (): Row[] => data().filter(r => r['tail'] !== true)

const lines = (): HTMLElement[] => screen.queryAllByTestId('line')
const ghostLine = (): HTMLElement | undefined =>
  lines().find(l => l.getAttribute('data-key') === 'ghost')
const domainOf = (id: string): number[] =>
  JSON.parse(screen.getByTestId(id).getAttribute('data-domain') || '[]')
const ticksOf = (id: string): number[] =>
  JSON.parse(screen.getByTestId(id).getAttribute('data-ticks') || '[]')

const baseProps = {
  timeline: DISTRICT_61_TIMELINE,
  mode: 'level' as const,
  tilesTotal: 71,
  tilesAsOf: '2026-10-11',
}

describe('EducationTimelineChart — the critical number', () => {
  it('prints the final total and the as-of date as text', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const headline = screen.getByTestId('education-timeline-headline')
    expect(headline).toHaveTextContent('71 awards')
    expect(headline).toHaveTextContent('Oct 11, 2026')
  })

  it('raises no notice when the final point equals the tiles', () => {
    render(<EducationTimelineChart {...baseProps} />)
    expect(screen.queryByTestId('education-timeline-mismatch')).toBeNull()
  })

  it('says plainly when the tiles are a different figure or date', () => {
    render(
      <EducationTimelineChart
        {...baseProps}
        tilesTotal={80}
        tilesAsOf="2026-10-18"
      />
    )
    const note = screen.getByTestId('education-timeline-mismatch')
    expect(note).toHaveTextContent('Oct 11, 2026')
    expect(note).toHaveTextContent('71')
    expect(note).toHaveTextContent('80')
    expect(note).toHaveTextContent('Oct 18, 2026')
  })

  it('stops at the page-selected date, so the last point is the tile date', () => {
    render(<EducationTimelineChart {...baseProps} through="2026-09-13" />)
    expect(points().at(-1)?.['date']).toBe('2026-09-13')
    // 22+10+6+3+1 levels, 2 DTM, 2 legacy
    expect(screen.getByTestId('education-timeline-headline')).toHaveTextContent(
      '46 awards'
    )
  })
})

describe('EducationTimelineChart — stacked step bands', () => {
  it('stacks L1..L5, DTM and Legacy in one stack', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const areas = screen.getAllByTestId('area')
    expect(areas.map(a => a.getAttribute('data-key'))).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'DTM',
      'Legacy',
    ])
    expect(new Set(areas.map(a => a.getAttribute('data-stack'))).size).toBe(1)
  })

  it('is a step: no slope is interpolated between snapshot dates', () => {
    render(<EducationTimelineChart {...baseProps} />)
    for (const a of screen.getAllByTestId('area')) {
      expect(a).toHaveAttribute('data-type', 'stepAfter')
    }
    expect(points()).toHaveLength(DISTRICT_61_TIMELINE.points.length)
  })

  it('binds each band to its entity colour hook, not its position', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const first = screen.getAllByTestId('area')[0]!
    expect(first.className).toContain('edu-tl-c--l1')
  })

  it('groups by path: the top paths plus Other', () => {
    render(<EducationTimelineChart {...baseProps} mode="path" />)
    const keys = screen
      .getAllByTestId('area')
      .map(a => a.getAttribute('data-key'))
    expect(keys).toEqual(['PM', 'DL', 'EH', 'MS', 'LD', 'rest'])
  })
})

describe('EducationTimelineChart — time axis and the latest step', () => {
  it('lays snapshots out on a time scale, so a gap looks like a gap', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const axis = screen.getByTestId('x-axis')
    expect(axis).toHaveAttribute('data-type', 'number')
    expect(axis).toHaveAttribute('data-scale', 'time')
    const t = points().map(r => r['t'] as number)
    const DAY = 86_400_000
    // 07-12 -> 07-19 is 7 days; 07-19 -> 08-02 is 14.
    expect((t[1]! - t[0]!) / DAY).toBe(7)
    expect((t[2]! - t[1]!) / DAY).toBe(14)
  })

  it('draws the latest step: one display-only tail row holds the final values', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const rows = data()
    const tails = rows.filter(r => r['tail'] === true)
    expect(tails).toHaveLength(1)
    const tail = rows.at(-1)!
    const last = points().at(-1)!
    expect(tail['tail']).toBe(true)
    // Same date and values as the final point; only its x is further right.
    expect(tail['date']).toBe(last['date'])
    expect(tail['total']).toBe(last['total'])
    expect(tail['L1']).toBe(last['L1'])
    expect(tail['ghost']).toBe(last['ghost'])
    expect(tail['t'] as number).toBeGreaterThan(last['t'] as number)
  })
})

describe('EducationTimelineChart — legend', () => {
  it('names each band with its final value (the old bar legend, kept)', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    // "Name: value" reads as one phrase, plain for a 95-year-old reader.
    expect(within(legend).getByText('Level 1: 34')).toBeVisible()
    expect(within(legend).getByText('Legacy: 2')).toBeVisible()
    expect(within(legend).getByText('DTM: 3')).toBeVisible()
  })

  it('names paths in full in path mode', () => {
    render(<EducationTimelineChart {...baseProps} mode="path" />)
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    expect(
      within(legend).getByText(/^Presentation Mastery: \d+$/)
    ).toBeVisible()
    // The rest band folds in DTM and legacy, and says so.
    expect(
      within(legend).getByText(/^All other awards \(incl\. DTM\): \d+$/)
    ).toBeVisible()
    expect(within(legend).queryByText(/^Other: /)).toBeNull()
  })
})

describe('EducationTimelineChart — prior-year ghost', () => {
  it('draws last year as a faint stepped line, never joined across a gap', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const line = ghostLine()!
    expect(line).toHaveAttribute('data-key', 'ghost')
    expect(line).toHaveAttribute('data-type', 'stepAfter')
    expect(line).toHaveAttribute('data-connect-nulls', 'false')
  })

  it('carries the aligned value on each row, null before last year had any', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const rows = points()
    expect(rows[0]?.['ghost']).toBeNull() // 2026-07-12 -> 2025-07-12
    expect(rows.at(-1)?.['ghost']).toBe(36) // 2026-10-11 -> 2025-10-05
  })

  it('labels a day-grain ghost "daily" and names the prior year', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    const item = within(legend)
      .getByText(/Last year/)
      .closest('li')!
    expect(item).toHaveTextContent('2025-26')
    expect(
      screen.getByTestId('education-timeline-ghost-note')
    ).toHaveTextContent(/daily/i)
  })

  it('labels a month-grain ghost as month-end', () => {
    render(
      <EducationTimelineChart {...baseProps} timeline={MONTH_GRAIN_TIMELINE} />
    )
    expect(
      screen.getByTestId('education-timeline-ghost-note')
    ).toHaveTextContent(/month-end/i)
  })

  it('shows no ghost and a small note when last year is not available', () => {
    render(
      <EducationTimelineChart {...baseProps} timeline={NO_PRIOR_TIMELINE} />
    )
    expect(ghostLine()).toBeUndefined()
    expect(screen.queryByTestId('reference-line')).toBeNull()
    expect(
      screen.getByTestId('education-timeline-ghost-note')
    ).toHaveTextContent('Last year is not available')
  })
})

describe('EducationTimelineChart — last year as a year-end target', () => {
  const oneYearEnd = {
    ...DISTRICT_61_TIMELINE,
    prior: {
      programYear: '2025-2026',
      source: 'timeline' as const,
      grain: 'day' as const,
      points: [{ at: '2026-06-30', total: 412 }],
    },
  }
  const props = { ...baseProps, timeline: oneYearEnd }

  it('draws the target as one full-width reference line, labelled on the line', () => {
    render(<EducationTimelineChart {...props} />)
    const ref = screen.getByTestId('reference-line')
    expect(ref).toHaveAttribute('data-y', '412')
    expect(ref).toHaveAttribute('data-label', 'Last year’s total: 412')
    // The reference line is the line: no stepped ghost curve alongside it.
    expect(ghostLine()).toBeUndefined()
  })

  it('spans the whole program year on the x-axis: Jul 1 to Jun 30', () => {
    render(<EducationTimelineChart {...props} />)
    expect(domainOf('x-axis')).toEqual([
      Date.UTC(2026, 6, 1),
      Date.UTC(2027, 5, 30),
    ])
    expect(ticksOf('x-axis')).toHaveLength(12)
  })

  it('leaves the x-axis on the data when there is a same-date curve', () => {
    render(<EducationTimelineChart {...baseProps} />)
    expect(domainOf('x-axis')[1]).toBeLessThan(Date.UTC(2026, 11, 1))
  })

  it('does not make the target a y-axis tick, so ticks never collide with it', () => {
    render(<EducationTimelineChart {...props} />)
    expect(ticksOf('y-axis')).not.toContain(412)
  })

  it('explains it is the whole-year total this year counts up toward', () => {
    render(<EducationTimelineChart {...props} />)
    const note = screen.getByTestId('education-timeline-ghost-note')
    expect(note).toHaveTextContent(
      'last year’s total for the whole year; this year counts up toward it by June 30'
    )
    expect(note).not.toHaveTextContent(/same-date comparison/i)
  })

  it('names it in the legend with its total', () => {
    render(<EducationTimelineChart {...props} />)
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    expect(within(legend).getByText('Last year’s total: 412')).toBeVisible()
  })

  it('puts last year’s total in the table on every row', () => {
    render(<EducationTimelineChart {...props} />)
    const table = screen.getByRole('table', {
      name: 'Education awards by snapshot date',
    })
    expect(
      within(table).getByRole('columnheader', { name: 'Last year’s total' })
    ).toBeInTheDocument()
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(row).toHaveTextContent('412')
    }
  })
})

describe('EducationTimelineChart — y-axis scale', () => {
  it('rounds up to a nice value with headroom over the peak and the target', () => {
    const t = {
      ...DISTRICT_61_TIMELINE,
      prior: {
        programYear: '2025-2026',
        source: 'timeline' as const,
        grain: 'day' as const,
        points: [{ at: '2026-06-30', total: 1246 }],
      },
    }
    render(<EducationTimelineChart {...baseProps} timeline={t} />)
    const [lo, hi] = domainOf('y-axis')
    expect(lo).toBe(0)
    expect(hi).toBeGreaterThanOrEqual(1246 * 1.08)
    expect(hi).toBeLessThanOrEqual(1246 * 1.4)
    const ticks = ticksOf('y-axis')
    expect(ticks[0]).toBe(0)
    expect(ticks.at(-1)).toBe(hi)
    // Round numbers only: every tick is a multiple of the step.
    const step = ticks[1]! - ticks[0]!
    expect(ticks.every((v, i) => v === i * step)).toBe(true)
    expect(step % 25).toBe(0)
  })

  it('gives the plain stack 8% headroom too', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const [, hi] = domainOf('y-axis')
    expect(hi).toBeGreaterThanOrEqual(71 * 1.08)
    expect(hi).toBeLessThanOrEqual(71 * 1.5)
  })
})

describe('EducationTimelineChart — y-axis label room', () => {
  it('widens the axis for six-digit totals so labels are not clipped', () => {
    const big = {
      ...DISTRICT_61_TIMELINE,
      prior: {
        programYear: '2025-2026',
        source: 'timeline' as const,
        grain: 'day' as const,
        points: [{ at: '2026-06-30', total: 102757 }],
      },
    }
    render(<EducationTimelineChart {...baseProps} timeline={big} />)
    // "102,757" at 13px needs ~ 7 chars * 8px + tick gap.
    expect(
      Number(screen.getByTestId('y-axis').getAttribute('data-width'))
    ).toBeGreaterThanOrEqual(68)
  })

  it('keeps the narrow axis for small totals', () => {
    render(<EducationTimelineChart {...baseProps} />)
    expect(
      Number(screen.getByTestId('y-axis').getAttribute('data-width'))
    ).toBeLessThanOrEqual(56)
  })
})

describe('EducationTimelineChart — motion and readout', () => {
  it('animates by default', () => {
    render(<EducationTimelineChart {...baseProps} />)
    expect(screen.getAllByTestId('area')[0]).toHaveAttribute(
      'data-animated',
      'true'
    )
  })

  it('turns animation off under prefers-reduced-motion', () => {
    window.matchMedia = matchMedia(true) as unknown as typeof window.matchMedia
    render(<EducationTimelineChart {...baseProps} />)
    for (const a of screen.getAllByTestId('area')) {
      expect(a).toHaveAttribute('data-animated', 'false')
    }
    for (const l of lines()) {
      expect(l).toHaveAttribute('data-animated', 'false')
    }
  })
})

describe('EducationTimelineChart — tooltip and readout total', () => {
  it('carries a Total series so the tooltip and the readout end with a Total row', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const total = lines().find(l => l.getAttribute('data-key') === 'total')!
    expect(total).toHaveAttribute('data-name', 'Total')
    // Its rows come after every band in the payload.
    const order = [...screen.getByTestId('chart').children].map(c =>
      c.getAttribute('data-key')
    )
    expect(order.indexOf('total')).toBeGreaterThan(order.indexOf('Legacy'))
  })
})

describe('EducationTimelineChart — table view', () => {
  it('offers the same numbers as a table, newest first', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const table = screen.getByRole('table', {
      name: 'Education awards by snapshot date',
    })
    const heads = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent)
    expect(heads).toEqual([
      'Date',
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4',
      'Level 5',
      'DTM',
      'Legacy',
      'Total',
      'Last year',
    ])
    const body = within(table).getAllByRole('row').slice(1)
    expect(body).toHaveLength(DISTRICT_61_TIMELINE.points.length)
    expect(body[0]).toHaveTextContent('Oct 11, 2026')
    expect(body[0]).toHaveTextContent('71')
    // The first date has no ghost: a dash, never 0.
    expect(body.at(-1)).toHaveTextContent('—')
  })

  it('has no Last year column when there is no prior year', () => {
    render(
      <EducationTimelineChart {...baseProps} timeline={NO_PRIOR_TIMELINE} />
    )
    expect(screen.queryByRole('columnheader', { name: 'Last year' })).toBeNull()
  })
})

describe('EducationTimelineChart data table on the shared styles (#2732, M4 of #2676)', () => {
  it('has the shared chrome, a caption, scoped headers and a labelled scroller', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const table = screen.getByRole('table', {
      name: 'Education awards by snapshot date',
    })
    expect(table).toHaveClass('dt')
    expect(table.querySelector('caption')?.textContent?.trim()).toBeTruthy()
    for (const th of table.querySelectorAll('thead th'))
      expect(th).toHaveAttribute('scope', 'col')
    for (const th of table.querySelectorAll('tbody th'))
      expect(th).toHaveAttribute('scope', 'row')
    const region = table.closest('[role="region"]')
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region?.getAttribute('aria-label')).toMatch(/scrolls sideways/)
  })
})
