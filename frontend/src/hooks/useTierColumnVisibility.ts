/**
 * Column visibility for a table whose columns are plain on/off choices
 * (#2689, #2676, spec §4.4, §10.3): the landing rankings table, and the next
 * tables to join the DataTable foundation.
 *
 * Effective visibility = the width's defaults overlaid with the user's sparse
 * overrides, with the always-shown columns forced on. Only a choice that
 * differs from this width's default is stored, so an untouched column keeps
 * following the width while an explicit "show Distinguished" holds at every
 * width. Unknown ids are dropped on load, so a stored value can never strand a
 * column.
 *
 * A column the URL sorts by is revealed while the sort is active (`reveal`),
 * even if the width or the user hides it: otherwise the table is ordered by
 * something nobody can see. The reveal is transient and never stored.
 *
 * Storage is `toast-stats:v1:<storageName>` holding
 * `{ schema: 1, overrides: { <id>: boolean } }`. It returns the same API shape
 * as the Clubs hook, so `ColumnsMenu` drives either.
 */

import { useCallback, useMemo, useState } from 'react'
import type { ColumnVisibilityApi } from './useColumnVisibility'
import type { BreakpointTier } from './useBreakpointTier'
import { readJson, writeJson } from '../utils/localStorageStore'

const SCHEMA = 1

export interface TierColumnVisibilityOptions {
  /** localStorage name, e.g. `rankings-table:columns`. */
  storageName: string
  /** Every column id, in table order. */
  ids: readonly string[]
  /** Ids that are always shown and cannot be switched off. */
  alwaysShown: readonly string[]
  /** The default visibility of every id at a tier. */
  defaultsFor: (tier: BreakpointTier) => Record<string, boolean>
  tier: BreakpointTier
  /** Column ids to show while active, e.g. the sorted column. */
  reveal?: readonly string[]
}

type Overrides = Record<string, boolean>

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function useTierColumnVisibility({
  storageName,
  ids,
  alwaysShown,
  defaultsFor,
  tier,
  reveal,
}: TierColumnVisibilityOptions): ColumnVisibilityApi {
  const toggleable = useMemo(
    () => ids.filter(id => !alwaysShown.includes(id)),
    [ids, alwaysShown]
  )

  const [overrides, setOverrides] = useState<Overrides>(() => {
    const stored = readJson<unknown>(storageName, null)
    if (
      !isRecord(stored) ||
      stored['schema'] !== SCHEMA ||
      !isRecord(stored['overrides'])
    ) {
      return {}
    }
    const out: Overrides = {}
    for (const [id, value] of Object.entries(stored['overrides'])) {
      if (toggleable.includes(id) && typeof value === 'boolean') out[id] = value
    }
    return out
  })

  const defaults = useMemo(() => defaultsFor(tier), [defaultsFor, tier])

  const revealKey = (reveal ?? []).join('|')
  const neededIds = useMemo(
    () =>
      (revealKey ? revealKey.split('|') : []).filter(id =>
        toggleable.includes(id)
      ),
    [revealKey, toggleable]
  )

  /** Needed by the sort but off: shown for now, never stored. */
  const revealed = useMemo(
    () => new Set(neededIds.filter(id => !(overrides[id] ?? defaults[id]))),
    [neededIds, overrides, defaults]
  )
  const needed = useMemo(() => new Set(neededIds), [neededIds])

  const visibility = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const id of ids) {
      out[id] = alwaysShown.includes(id)
        ? true
        : revealed.has(id) || (overrides[id] ?? defaults[id] ?? false)
    }
    return out
  }, [ids, alwaysShown, overrides, defaults, revealed])

  const commit = useCallback(
    (next: Overrides) => {
      setOverrides(next)
      writeJson(storageName, { schema: SCHEMA, overrides: next })
    },
    [storageName]
  )

  const setVisible = useCallback(
    (id: string, next: boolean) => {
      if (!toggleable.includes(id) || revealed.has(id)) return
      const updated = { ...overrides }
      if (next === defaults[id]) delete updated[id]
      else updated[id] = next
      commit(updated)
    },
    [toggleable, revealed, overrides, defaults, commit]
  )

  const toggle = useCallback(
    (id: string) => setVisible(id, !visibility[id]),
    [setVisible, visibility]
  )

  const showAll = useCallback(() => {
    const updated = { ...overrides }
    for (const id of toggleable) {
      if (defaults[id]) delete updated[id]
      else updated[id] = true
    }
    commit(updated)
  }, [overrides, toggleable, defaults, commit])

  const reset = useCallback(() => commit({}), [commit])

  const isVisible = useCallback(
    (id: string) => visibility[id] === true,
    [visibility]
  )

  // A revealed column is a view of the URL, not a choice: it is not "custom".
  const isCustom = toggleable.some(
    id => !revealed.has(id) && visibility[id] !== defaults[id]
  )

  return {
    visibility,
    overrides,
    isVisible,
    setVisible,
    toggle,
    showAll,
    reset,
    revealed,
    needed,
    isCustom,
    shownCount: ids.filter(id => visibility[id]).length,
    totalCount: ids.length,
  }
}
