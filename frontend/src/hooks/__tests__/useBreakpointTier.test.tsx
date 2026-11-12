/**
 * useBreakpointTier (#2676, spec §4.5, risk R-4): the tier is read
 * synchronously on the first render, so the first frame never shows the wrong
 * column set (CLS must stay <= 0.1).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { vi } from 'vitest'
import { useBreakpointTier, type BreakpointTier } from '../useBreakpointTier'
import { stubViewportWidth } from '../../test-utils/viewportMatchMedia'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Every tier value seen during render, in order: [0] is the first frame. */
const renderedTiers = (): BreakpointTier[] => {
  const seen: BreakpointTier[] = []
  const Probe = () => {
    seen.push(useBreakpointTier())
    return null
  }
  render(<Probe />)
  return seen
}

describe('useBreakpointTier (#2676)', () => {
  it.each([
    [768, 'tablet'],
    [1023, 'tablet'],
    [1024, 'laptop'],
    [1279, 'laptop'],
    [1280, 'desktop'],
    [1599, 'desktop'],
    [1600, 'wide'],
    [2400, 'wide'],
  ] as const)('at %ipx the tier is %s', (width, tier) => {
    stubViewportWidth(width)
    expect(renderedTiers()[0]).toBe(tier)
  })

  it('reads the viewport on the very first render, with no effect pass', () => {
    stubViewportWidth(1280)
    const seen = renderedTiers()
    expect(seen[0]).toBe('desktop')
    expect(new Set(seen)).toEqual(new Set(['desktop']))
  })
})
