/**
 * Phone x axis (#1835): below 768 a chart's x axis shows 3–4 horizontal
 * ticks, first and last kept (`interval="preserveStartEnd"`), never the
 * desktop's −45° labels — a rotated 12 px date is unreadable on a phone and
 * eats 80 px of a 400 px plot.
 */
import { describe, it, expect } from 'vitest'
import {
  compactTicks,
  dateAxisLayout,
  COMPACT_TICK_COUNT,
} from '../compactAxis'

describe('compactTicks', () => {
  it('keeps every value when there are at most four', () => {
    expect(compactTicks(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('picks four evenly spaced values, first and last included', () => {
    const days = Array.from({ length: 12 }, (_, i) => i * 31)
    const ticks = compactTicks(days)
    expect(ticks).toHaveLength(COMPACT_TICK_COUNT)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBe(11 * 31)
    expect(ticks).toEqual([0, 4 * 31, 7 * 31, 11 * 31])
  })

  it('drops duplicate values before spacing', () => {
    expect(compactTicks([1, 1, 2, 2, 3, 3, 4, 4, 5])).toEqual([1, 2, 4, 5])
  })
})

describe('dateAxisLayout', () => {
  const dates = Array.from({ length: 30 }, (_, i) => `2026-08-${i + 1}`)

  it('desktop keeps the rotated labels and its own interval', () => {
    expect(dateAxisLayout(false, dates, 3)).toEqual({
      angle: -45,
      textAnchor: 'end',
      height: 80,
      interval: 3,
    })
  })

  it('phone: horizontal labels, four ticks, preserveStartEnd', () => {
    const layout = dateAxisLayout(true, dates, 3)
    expect(layout.angle).toBe(0)
    expect(layout.textAnchor).toBe('middle')
    expect(layout.interval).toBe('preserveStartEnd')
    expect(layout.ticks).toHaveLength(4)
    expect(layout.ticks?.[0]).toBe('2026-08-1')
    expect(layout.ticks?.[3]).toBe('2026-08-30')
    expect(layout.height).toBeLessThanOrEqual(32)
  })
})
