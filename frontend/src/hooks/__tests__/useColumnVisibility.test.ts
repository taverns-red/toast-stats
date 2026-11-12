/**
 * useColumnVisibility (#2676, spec §4.1 and §4.4; test plan 1 and 2).
 *
 * Effective visibility = tier defaults overlaid with sparse user overrides.
 * Only a choice that differs from the width's default is stored; v1
 * `hidden-groups` / `changes-visible` keys migrate once.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useColumnVisibility,
  loadColumnOverrides,
  COLUMNS_STORAGE_NAME,
  type UseColumnVisibilityOptions,
} from '../useColumnVisibility'
import { storageKey } from '../../utils/localStorageStore'
import type { BreakpointTier } from '../../components/clubsColumnMeta'

const KEY = storageKey(COLUMNS_STORAGE_NAME)
const HIDDEN_GROUPS_KEY = storageKey('clubs-table:hidden-groups')
const CHANGES_KEY = storageKey('clubs-table:changes-visible')

const DELTAS = [
  'deltaMembership',
  'deltaPayments',
  'deltaDcpGoals',
  'tierTransition',
  'distinguishedFlip',
]

const opts = (
  tier: BreakpointTier,
  over: Partial<UseColumnVisibilityOptions> = {}
): UseColumnVisibilityOptions => ({
  tier,
  changesAvailable: false,
  sinceActive: false,
  ...over,
})

const shown = (visibility: Record<string, boolean>): string[] =>
  Object.keys(visibility)
    .filter(id => visibility[id])
    .sort()

const stored = () => {
  const raw = localStorage.getItem(KEY)
  return raw === null ? null : JSON.parse(raw)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('useColumnVisibility: tier defaults (#2676)', () => {
  it('768 shows Club, Health, Members, DCP and Tier', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('tablet')))
    expect(shown(result.current.visibility)).toEqual(
      ['distinguished', 'dcpGoals', 'membership', 'name', 'status'].sort()
    )
  })

  it('1024 adds Division, Area, Trend and Needed', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('laptop')))
    expect(shown(result.current.visibility)).toEqual(
      [
        'name',
        'status',
        'membership',
        'dcpGoals',
        'distinguished',
        'division',
        'area',
        'netChange',
        'membersNeeded',
      ].sort()
    )
  })

  it('1280 adds Club status and Coach (11 of 15)', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('desktop')))
    const on = shown(result.current.visibility)
    expect(on).toHaveLength(11)
    expect(on).toContain('clubStatus')
    expect(on).toContain('coach')
    expect(on).not.toContain('yearsChartered')
    expect(on).not.toContain('newMembers')
  })

  it('1600 shows all 15', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('wide')))
    expect(shown(result.current.visibility)).toHaveLength(15)
  })
})

describe('useColumnVisibility: overrides (#2676)', () => {
  it('an explicit "show Years" holds at every tier', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { yearsChartered: true } })
    )
    for (const tier of ['tablet', 'laptop', 'desktop', 'wide'] as const) {
      const { result } = renderHook(() => useColumnVisibility(opts(tier)))
      expect(result.current.visibility.yearsChartered).toBe(true)
    }
  })

  it('an explicit "hide DCP" holds at every tier', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { dcpGoals: false } })
    )
    for (const tier of ['tablet', 'wide'] as const) {
      const { result } = renderHook(() => useColumnVisibility(opts(tier)))
      expect(result.current.visibility.dcpGoals).toBe(false)
    }
  })

  it('untouched columns still follow the width default after an override', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { yearsChartered: true } })
    )
    const { result, rerender } = renderHook(
      (o: UseColumnVisibilityOptions) => useColumnVisibility(o),
      { initialProps: opts('tablet') }
    )
    expect(result.current.visibility.coach).toBe(false)
    rerender(opts('desktop'))
    expect(result.current.visibility.coach).toBe(true)
  })

  it('writing a value equal to the default deletes the key', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('wide')))
    act(() => result.current.setVisible('coach', false))
    expect(stored().overrides).toEqual({ coach: false })
    act(() => result.current.setVisible('coach', true))
    expect(stored().overrides).toEqual({})
    expect(stored().schema).toBe(2)
  })

  it('toggle flips the effective value', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('tablet')))
    expect(result.current.isVisible('yearsChartered')).toBe(false)
    act(() => result.current.toggle('yearsChartered'))
    expect(result.current.isVisible('yearsChartered')).toBe(true)
    expect(stored().overrides).toEqual({ yearsChartered: true })
  })

  it('drops unknown ids', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { bogus: true, coach: true } })
    )
    const { result } = renderHook(() => useColumnVisibility(opts('tablet')))
    expect(result.current.visibility).not.toHaveProperty('bogus')
    expect(result.current.overrides).toEqual({ coach: true })
  })

  it('never lets Club be hidden', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { name: false } })
    )
    const { result } = renderHook(() => useColumnVisibility(opts('tablet')))
    expect(result.current.visibility.name).toBe(true)
    act(() => result.current.setVisible('name', false))
    expect(result.current.visibility.name).toBe(true)
  })

  it('reset clears every override', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('tablet')))
    act(() => result.current.toggle('yearsChartered'))
    act(() => result.current.toggle('coach'))
    expect(result.current.isCustom).toBe(true)
    act(() => result.current.reset())
    expect(result.current.isCustom).toBe(false)
    expect(stored()).toEqual({ schema: 2, overrides: {} })
    expect(shown(result.current.visibility)).toHaveLength(5)
  })

  it('showAll turns every offered column on', () => {
    const { result } = renderHook(() => useColumnVisibility(opts('tablet')))
    act(() => result.current.showAll())
    expect(shown(result.current.visibility)).toHaveLength(15)
    expect(result.current.isCustom).toBe(true)
  })

  it('is not custom when a stored override equals this width default', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { netChange: true } })
    )
    const { result } = renderHook(() => useColumnVisibility(opts('laptop')))
    expect(result.current.isCustom).toBe(false)
  })
})

describe('useColumnVisibility: counts (#2676)', () => {
  it('counts 5 of 15 at 768 and 9 of 15 at 1024', () => {
    const a = renderHook(() => useColumnVisibility(opts('tablet')))
    expect([a.result.current.shownCount, a.result.current.totalCount]).toEqual([
      5, 15,
    ])
    const b = renderHook(() => useColumnVisibility(opts('laptop')))
    expect([b.result.current.shownCount, b.result.current.totalCount]).toEqual([
      9, 15,
    ])
  })

  it('excludes the Changes columns while no diff is loaded', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        schema: 2,
        overrides: Object.fromEntries(DELTAS.map(id => [id, true])),
      })
    )
    const { result } = renderHook(() => useColumnVisibility(opts('wide')))
    expect(result.current.totalCount).toBe(15)
    expect(result.current.shownCount).toBe(15)
    for (const id of DELTAS) expect(result.current.visibility[id]).toBe(false)
  })

  it('offers the Changes columns, off by default, when a diff is loaded', () => {
    const { result } = renderHook(() =>
      useColumnVisibility(opts('wide', { changesAvailable: true }))
    )
    expect(result.current.totalCount).toBe(20)
    expect(result.current.shownCount).toBe(15)
    act(() => result.current.toggle('deltaMembership'))
    expect(result.current.shownCount).toBe(16)
  })

  it('counts "vs last year" only while the preset is on, and never stores it', () => {
    const off = renderHook(() => useColumnVisibility(opts('tablet')))
    expect(off.result.current.visibility.sinceLastYear).toBe(false)
    const on = renderHook(() =>
      useColumnVisibility(opts('tablet', { sinceActive: true }))
    )
    expect(on.result.current.visibility.sinceLastYear).toBe(true)
    expect(on.result.current.totalCount).toBe(16)
    expect(on.result.current.shownCount).toBe(6)
    expect(on.result.current.isCustom).toBe(false)
    expect(localStorage.getItem(KEY) ?? '').not.toContain('sinceLastYear')
  })
})

describe('column prefs: v1 migration (#2676, spec §4.4)', () => {
  it('turns a hidden "renewals" group into per-column overrides and removes both v1 keys', () => {
    localStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify(['renewals']))
    localStorage.setItem(CHANGES_KEY, 'false')
    expect(loadColumnOverrides()).toEqual({
      octoberRenewals: false,
      aprilRenewals: false,
    })
    expect(localStorage.getItem(HIDDEN_GROUPS_KEY)).toBeNull()
    expect(localStorage.getItem(CHANGES_KEY)).toBeNull()
    expect(stored()).toEqual({
      schema: 2,
      overrides: { octoberRenewals: false, aprilRenewals: false },
    })
  })

  it('maps each old group to the columns it held under the old mapping', () => {
    localStorage.setItem(
      HIDDEN_GROUPS_KEY,
      JSON.stringify(['identity', 'membership', 'recognition'])
    )
    expect(loadColumnOverrides()).toEqual({
      division: false,
      area: false,
      clubStatus: false,
      coach: false,
      yearsChartered: false,
      membership: false,
      netChange: false,
      membersNeeded: false,
      newMembers: false,
      status: false,
      dcpGoals: false,
      distinguished: false,
    })
  })

  it('turns changes-visible: true into the five Changes columns on', () => {
    localStorage.setItem(CHANGES_KEY, 'true')
    expect(loadColumnOverrides()).toEqual(
      Object.fromEntries(DELTAS.map(id => [id, true]))
    )
    expect(localStorage.getItem(CHANGES_KEY)).toBeNull()
  })

  it('treats a corrupt v1 value as {} and still removes the old key', () => {
    localStorage.setItem(HIDDEN_GROUPS_KEY, '{not json')
    expect(loadColumnOverrides()).toEqual({})
    expect(localStorage.getItem(HIDDEN_GROUPS_KEY)).toBeNull()
  })

  it('ignores unknown group ids in the v1 value', () => {
    localStorage.setItem(
      HIDDEN_GROUPS_KEY,
      JSON.stringify(['renewals', 'bogus-group'])
    )
    expect(loadColumnOverrides()).toEqual({
      octoberRenewals: false,
      aprilRenewals: false,
    })
  })

  it('does not migrate once clubs-table:columns exists', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 2, overrides: { coach: true } })
    )
    localStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify(['renewals']))
    expect(loadColumnOverrides()).toEqual({ coach: true })
    expect(localStorage.getItem(HIDDEN_GROUPS_KEY)).not.toBeNull()
  })

  it('ignores a stored value whose schema is not 2', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ schema: 1, overrides: { coach: true } })
    )
    expect(loadColumnOverrides()).toEqual({})
  })

  it('migrates inside the hook so the first render already has the choice', () => {
    localStorage.setItem(HIDDEN_GROUPS_KEY, JSON.stringify(['renewals']))
    const seen: boolean[] = []
    renderHook(() => {
      const c = useColumnVisibility(opts('wide'))
      seen.push(c.visibility.octoberRenewals)
    })
    expect(seen[0]).toBe(false)
  })
})
