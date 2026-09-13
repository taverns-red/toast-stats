/* #1570 — the legend strip must name the bands in the order they are PAINTED.
 *
 * Sibling file `RaceChart.test.tsx` mocks recharts, which is right for
 * asserting the data contract and wrong for this: it asserted the order of
 * the `<Area>` children and passed green while the shipped legend rendered
 * "Distinguished, President's, Select, Smedley" — Recharts does not derive a
 * stacked AreaChart's legend payload from child order. An input-order
 * assertion cannot catch a renderer that reorders the output, so this file
 * renders the REAL recharts and reads the text out of the DOM.
 *
 * ResponsiveContainer measures its parent, which jsdom reports as 0×0, so it
 * is replaced by a clone that hands the chart fixed dimensions — the chart
 * itself, legend included, is the genuine component. */

import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { GlobalClubRaceTimelinePoint } from '@taverns-red/shared-contracts'
import type { ClubRaceTierCounts } from '../../../utils/clubRaceCounts'
import { RaceChart } from '../RaceChart'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(
        children as React.ReactElement,
        {
          width: 800,
          height: 260,
        } as Partial<unknown>
      ),
  }
})

const timeline: GlobalClubRaceTimelinePoint[] = [
  {
    date: '2026-07-26',
    Distinguished: 1,
    Select: 0,
    President: 0,
    Smedley: 0,
    official: 0,
  },
  {
    date: '2026-08-14',
    Distinguished: 20,
    Select: 4,
    President: 3,
    Smedley: 1,
    official: 0,
  },
  {
    date: '2026-09-12',
    Distinguished: 35,
    Select: 4,
    President: 3,
    Smedley: 0,
    official: 0,
  },
]

const currentCounts: ClubRaceTierCounts = {
  Distinguished: 31,
  Select: 1,
  President: 3,
  Smedley: 0,
}

const legendText = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('.recharts-legend-item-text')].map(node =>
    (node.textContent || '').trim()
  )

describe('RaceChart legend (#1570)', () => {
  afterEach(cleanup)

  it('names the tiers in painted order, lowest band first', () => {
    const { container } = render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    expect(legendText(container)).toEqual([
      'Distinguished',
      'Select Distinguished',
      "President's Distinguished",
      'Smedley Distinguished',
    ])
  })

  it('drops the Smedley entry with the Smedley band', () => {
    const { container } = render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable={false}
        currentCounts={currentCounts}
      />
    )
    expect(legendText(container)).toEqual([
      'Distinguished',
      'Select Distinguished',
      "President's Distinguished",
    ])
  })

  it('gives every legend entry the colour of the band it names', () => {
    const { container } = render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    const colours = [
      ...container.querySelectorAll<HTMLElement>('.recharts-legend-item-text'),
    ].map(node => node.style.color)
    expect(colours).toEqual([
      'rgb(212, 135, 63)', // #D4873F --rt-stats, Distinguished
      'rgb(230, 57, 70)', // #E63946 --rt-red, Select
      'rgb(142, 27, 37)', // #8E1B25 --rt-red-dk, President's
      'rgb(61, 59, 56)', // #3D3B38 --rt-ink-2, Smedley
    ])
  })
})
