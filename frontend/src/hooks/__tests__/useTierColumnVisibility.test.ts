/**
 * useTierColumnVisibility (#2689, #2676 spec §4.4): the plain on/off column
 * model behind the landing rankings table. Effective visibility = the width's
 * defaults overlaid with sparse user overrides; always-shown columns cannot be
 * hidden; a column the sort needs is revealed (transiently) while it is sorted.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useTierColumnVisibility,
  type TierColumnVisibilityOptions,
} from '../useTierColumnVisibility'
import {
  ALWAYS_SHOWN_RANKINGS_IDS,
  RANKINGS_COLUMN_IDS,
  rankingsTierDefaults,
} from '../../components/rankingsColumnMeta'
import { storageKey } from '../../utils/localStorageStore'
import type { BreakpointTier } from '../useBreakpointTier'

const NAME = 'rankings-table:columns'
const KEY = storageKey(NAME)

const opts = (
  tier: BreakpointTier,
  over: Partial<TierColumnVisibilityOptions> = {}
): TierColumnVisibilityOptions => ({
  storageName: NAME,
  ids: RANKINGS_COLUMN_IDS,
  alwaysShown: ALWAYS_SHOWN_RANKINGS_IDS,
  defaultsFor: rankingsTierDefaults,
  tier,
  ...over,
})

const shown = (visibility: Record<string, boolean>): string[] =>
  Object.keys(visibility).filter(id => visibility[id])

const stored = () => {
  const raw = localStorage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

describe('useTierColumnVisibility', () => {
  beforeEach(() => localStorage.clear())

  it('starts from the width defaults', () => {
    const tablet = renderHook(() => useTierColumnVisibility(opts('tablet')))
    expect(shown(tablet.result.current.visibility)).toEqual([
      'district',
      'rank',
      'clubs',
      'payments',
      'score',
    ])
    const laptop = renderHook(() => useTierColumnVisibility(opts('laptop')))
    expect(shown(laptop.result.current.visibility)).toEqual([
      ...RANKINGS_COLUMN_IDS,
    ])
  })

  it('an override wins at every width, and is stored sparsely', () => {
    const { result, rerender } = renderHook(
      (o: TierColumnVisibilityOptions) => useTierColumnVisibility(o),
      { initialProps: opts('tablet') }
    )
    act(() => result.current.toggle('distinguished'))
    expect(result.current.visibility['distinguished']).toBe(true)
    expect(stored()).toEqual({
      schema: 1,
      overrides: { distinguished: true },
    })
    rerender(opts('wide'))
    expect(result.current.visibility['distinguished']).toBe(true)
  })

  it('writing a value equal to the width default deletes the key', () => {
    const { result } = renderHook(() => useTierColumnVisibility(opts('tablet')))
    act(() => result.current.toggle('distinguished'))
    act(() => result.current.toggle('distinguished'))
    expect(stored()).toEqual({ schema: 1, overrides: {} })
    expect(result.current.isCustom).toBe(false)
  })

  it('never hides an always-shown column', () => {
    const { result } = renderHook(() => useTierColumnVisibility(opts('tablet')))
    for (const id of ALWAYS_SHOWN_RANKINGS_IDS) {
      act(() => result.current.setVisible(id, false))
      expect(result.current.visibility[id]).toBe(true)
    }
    expect(stored()).toBeNull()
  })

  it('drops unknown and always-shown ids from stored overrides', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        schema: 1,
        overrides: { distinguished: true, nope: true, score: false },
      })
    )
    const { result } = renderHook(() => useTierColumnVisibility(opts('tablet')))
    expect(result.current.overrides).toEqual({ distinguished: true })
    expect(result.current.visibility['score']).toBe(true)
  })

  it('ignores a stored value with another schema or a corrupt shape', () => {
    localStorage.setItem(KEY, JSON.stringify({ schema: 9, overrides: {} }))
    const a = renderHook(() => useTierColumnVisibility(opts('tablet')))
    expect(a.result.current.overrides).toEqual({})
    localStorage.setItem(KEY, '"garbage"')
    const b = renderHook(() => useTierColumnVisibility(opts('tablet')))
    expect(b.result.current.overrides).toEqual({})
  })

  it('reveals a column the sort needs without storing it', () => {
    const { result } = renderHook(() =>
      useTierColumnVisibility(opts('tablet', { reveal: ['distinguished'] }))
    )
    expect(result.current.visibility['distinguished']).toBe(true)
    expect(result.current.revealed.has('distinguished')).toBe(true)
    expect(result.current.isCustom).toBe(false)
    act(() => result.current.toggle('distinguished'))
    expect(stored()).toBeNull()
  })

  it('reset clears the overrides; show all turns every column on', () => {
    const { result } = renderHook(() => useTierColumnVisibility(opts('tablet')))
    act(() => result.current.showAll())
    expect(shown(result.current.visibility)).toEqual([...RANKINGS_COLUMN_IDS])
    expect(result.current.shownCount).toBe(RANKINGS_COLUMN_IDS.length)
    act(() => result.current.reset())
    expect(result.current.shownCount).toBe(5)
    expect(result.current.totalCount).toBe(RANKINGS_COLUMN_IDS.length)
  })
})
