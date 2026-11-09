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
    type,
    connectNulls,
    isAnimationActive,
  }: {
    dataKey: string
    type?: string
    connectNulls?: boolean
    isAnimationActive?: boolean
  }) => (
    <div
      data-testid="line"
      data-key={dataKey}
      data-type={type}
      data-connect-nulls={String(connectNulls === true)}
      data-animated={isAnimationActive ? 'true' : 'false'}
    />
  ),
  XAxis: ({ type, scale }: { type?: string; scale?: string }) => (
    <div data-testid="x-axis" data-type={type} data-scale={scale} />
  ),
  YAxis: () => <div data-testid="y-axis" />,
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
    const level1 = within(legend).getByText('Level 1').closest('li')!
    expect(level1).toHaveTextContent('34')
    expect(within(legend).getByText('Legacy').closest('li')).toHaveTextContent(
      '2'
    )
    expect(within(legend).getByText('DTM').closest('li')).toHaveTextContent('3')
  })

  it('names paths in full in path mode', () => {
    render(<EducationTimelineChart {...baseProps} mode="path" />)
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    expect(within(legend).getByText('Presentation Mastery')).toBeVisible()
    expect(within(legend).getByText('Other')).toBeVisible()
  })

  it('prints the notes handed in (legacy codes)', () => {
    render(
      <EducationTimelineChart
        {...baseProps}
        notes={<p>Legacy awards by code: CC 2</p>}
      />
    )
    expect(screen.getByText('Legacy awards by code: CC 2')).toBeVisible()
  })
})

describe('EducationTimelineChart — prior-year ghost', () => {
  it('draws last year as a faint stepped line, never joined across a gap', () => {
    render(<EducationTimelineChart {...baseProps} />)
    const line = screen.getByTestId('line')
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
    expect(screen.queryByTestId('line')).toBeNull()
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

  it('draws one faint flat line and labels it with the total', () => {
    render(<EducationTimelineChart {...props} />)
    expect(screen.getByTestId('line')).toHaveAttribute('data-key', 'ghost')
    expect(points().every(r => r['ghost'] === 412)).toBe(true)
    const legend = screen.getByRole('list', { name: 'Chart legend' })
    expect(within(legend).getByText(/Last year’s total: 412/)).toBeVisible()
  })

  it('explains it is the year-end total, not a same-date curve', () => {
    render(<EducationTimelineChart {...props} />)
    expect(
      screen.getByTestId('education-timeline-ghost-note')
    ).toHaveTextContent(/year-end|final total/i)
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
    expect(screen.getByTestId('line')).toHaveAttribute('data-animated', 'false')
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
