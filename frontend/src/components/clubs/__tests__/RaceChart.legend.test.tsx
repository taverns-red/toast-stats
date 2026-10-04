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

  // #1616 — the colour belongs to the SWATCH only. Painting the label text in
  // the series colour put #004165 / #7b1828 text on the dark surface (≈1.6:1),
  // so every label reads in the theme's neutral ink, which the redesign
  // tokens remap per theme (light #344052 on #fff, dark #c8d1dd on #111922 —
  // both well above WCAG AA 4.5:1).
  it('writes every legend label in neutral theme ink, never a series colour', () => {
    const { container } = render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    const labelColours = [
      ...container.querySelectorAll<HTMLElement>('.recharts-legend-item-text'),
    ].map(node => node.style.color)
    expect(labelColours).toEqual([
      'var(--ink-2)',
      'var(--ink-2)',
      'var(--ink-2)',
      'var(--ink-2)',
    ])
  })

  it('gives every legend swatch the colour of the band it names', () => {
    const { container } = render(
      <RaceChart
        timeline={timeline}
        smedleyAvailable
        currentCounts={currentCounts}
      />
    )
    const toRgb = (hex: string | null): string => {
      const probe = document.createElement('i')
      probe.style.color = hex ?? ''
      return probe.style.color
    }
    const colours = [
      ...container.querySelectorAll('.recharts-legend-item'),
    ].map(item =>
      toRgb(item.querySelector('svg [fill]')?.getAttribute('fill') ?? null)
    )
    expect(colours).toEqual([
      'rgb(21, 128, 61)', // #15803d --green-600, Distinguished
      'rgb(44, 110, 144)', // #2c6e90 --loyal-400, Select
      'rgb(0, 65, 101)', // #004165 --loyal-500, President's
      'rgb(123, 24, 40)', // #7b1828 --maroon-500, Smedley
    ])
  })
})
