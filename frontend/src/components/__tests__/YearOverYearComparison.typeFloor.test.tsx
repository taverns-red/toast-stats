import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'

/* #2125: the year-over-year y-axis ticks are data (0, 1.3k, 23%), so they
 * take the 14px phone floor, not the 12px eyebrow size (#1840). At 375 the
 * fourteen 12px ticks were the only data text under 14px on
 * /district/61/trends and tipped the 375 gate's 5% ratchet.
 *
 * jsdom gives ResponsiveContainer no size, so it is given one (the
 * RaceChart.legend pattern) and Recharts paints its real ticks. */
vi.mock('recharts', async importOriginal => {
  const actual = await importOriginal<typeof import('recharts')>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.cloneElement(
        children as React.ReactElement,
        {
          width: 320,
          height: 200,
        } as Partial<unknown>
      ),
  }
})

import { YearOverYearComparison } from '../YearOverYearComparison'

describe('YearOverYearComparison y-axis type floor (#2125)', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders every y-axis tick at 14px or larger', () => {
    const { container } = render(
      <YearOverYearComparison
        yearOverYear={{
          membershipChange: -0.8,
          distinguishedChange: -25,
          clubHealthChange: 17.7,
        }}
        currentYear={{
          totalMembership: 2229,
          distinguishedClubs: 6,
          thrivingClubs: 22,
          totalClubs: 114,
        }}
      />
    )

    const ticks = container.querySelectorAll<SVGTextElement>(
      '.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value'
    )
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) {
      expect(parseFloat(tick.style.fontSize)).toBeGreaterThanOrEqual(14)
    }
  })
})
