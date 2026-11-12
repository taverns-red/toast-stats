/**
 * Clubs table column visibility (#2676, spec §4.1, §4.3, §4.4).
 *
 * Effective visibility = the width's defaults overlaid with the user's sparse
 * overrides, with Club forced on. Only a choice that differs from this width's
 * default is stored, so an untouched column keeps following the width while an
 * explicit "show Coach" holds at every width. A stored value can never strand a
 * column: unknown ids are dropped, new columns get their default, and Club
 * cannot be hidden.
 *
 * Storage is `toast-stats:v1:clubs-table:columns` holding
 * `{ schema: 2, overrides: { <id>: boolean } }`. The global storage version is
 * not bumped (that would wipe favourites and every other preference). The two
 * v1 keys (`clubs-table:hidden-groups`, `clubs-table:changes-visible`) migrate
 * once, synchronously, before the first render commits.
 *
 * "vs last year" follows the `?since=` preset and is never stored. The Changes
 * columns are counted and offered only while a snapshot diff is loaded.
 *
 * A column the URL sorts or filters by is revealed while that is active
 * (`reveal`), even if the width or the user hides it: otherwise the table is
 * ordered or narrowed by something nobody can see. The reveal is transient and
 * never written to the saved overrides.
 */

import { useCallback, useMemo, useState } from 'react'
import {
  ALWAYS_SHOWN_COLUMN_ID,
  BASE_COLUMN_IDS,
  CHANGES_COLUMN_IDS,
  SINCE_COLUMN_ID,
  columnMeta,
  tierDefaults,
  type BreakpointTier,
} from '../components/clubsColumnMeta'
import { readJson, removeKey, writeJson } from '../utils/localStorageStore'

export const COLUMNS_STORAGE_NAME = 'clubs-table:columns'
export const COLUMN_PREFS_SCHEMA = 2

const V1_HIDDEN_GROUPS_NAME = 'clubs-table:hidden-groups'
const V1_CHANGES_VISIBLE_NAME = 'clubs-table:changes-visible'

/** Which columns each v1 group held under the OLD mapping (before #2676). */
const V1_GROUP_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  identity: ['division', 'area', 'clubStatus', 'coach', 'yearsChartered'],
  membership: ['membership', 'netChange', 'membersNeeded', 'newMembers'],
  renewals: ['octoberRenewals', 'aprilRenewals'],
  recognition: ['status', 'dcpGoals', 'distinguished'],
}

export type ColumnOverrides = Record<string, boolean>

export interface UseColumnVisibilityOptions {
  tier: BreakpointTier
  /** A snapshot diff is loaded, so the Changes columns can be offered. */
  changesAvailable: boolean
  /** The `?since=` preset is on, so "vs last year" is present. */
  sinceActive: boolean
  /** Column ids to show while active, e.g. the sorted and filtered columns. */
  reveal?: readonly string[]
}

export interface ColumnVisibilityApi {
  /** Every known column id mapped to its visibility (TanStack's state). */
  visibility: Record<string, boolean>
  /** Sparse user choices that differ from the tier default. */
  overrides: ColumnOverrides
  isVisible: (id: string) => boolean
  setVisible: (id: string, next: boolean) => void
  toggle: (id: string) => void
  showAll: () => void
  reset: () => void
  /** Columns shown only because the sort or a filter needs them (transient,
   *  not saved). */
  revealed: ReadonlySet<string>
  /** Columns the sort or a filter needs on screen, whether or not the user
   *  also chose to show them. Unchecking one of these hides nothing yet. */
  needed: ReadonlySet<string>
  /** The shown set differs from this width's default. */
  isCustom: boolean
  shownCount: number
  totalCount: number
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Columns a user can switch: not Club (always on), not "vs last year" (a
 *  preset), and only ids this table knows. */
const isToggleable = (id: string): boolean =>
  id in columnMeta && id !== ALWAYS_SHOWN_COLUMN_ID && id !== SINCE_COLUMN_ID

const sanitize = (raw: Record<string, unknown>): ColumnOverrides => {
  const out: ColumnOverrides = {}
  for (const [id, value] of Object.entries(raw)) {
    if (isToggleable(id) && typeof value === 'boolean') out[id] = value
  }
  return out
}

const persist = (overrides: ColumnOverrides): void => {
  writeJson(COLUMNS_STORAGE_NAME, {
    schema: COLUMN_PREFS_SCHEMA,
    overrides,
  })
}

/** Migrate the two v1 keys into overrides, then remove them. A corrupt v1
 *  value migrates to nothing. */
const migrateV1 = (): ColumnOverrides => {
  const hidden = readJson<unknown>(V1_HIDDEN_GROUPS_NAME, null)
  const changes = readJson<unknown>(V1_CHANGES_VISIBLE_NAME, null)
  const overrides: ColumnOverrides = {}
  if (Array.isArray(hidden)) {
    for (const group of hidden) {
      const ids =
        typeof group === 'string' ? V1_GROUP_COLUMNS[group] : undefined
      if (ids) for (const id of ids) overrides[id] = false
    }
  }
  if (changes === true) {
    for (const id of CHANGES_COLUMN_IDS) overrides[id] = true
  }
  removeKey(V1_HIDDEN_GROUPS_NAME)
  removeKey(V1_CHANGES_VISIBLE_NAME)
  if (Object.keys(overrides).length > 0) persist(overrides)
  return overrides
}

/** Read the stored overrides, migrating the v1 keys once when the new key is
 *  absent. A value with any other schema is ignored. */
export function loadColumnOverrides(): ColumnOverrides {
  const stored = readJson<unknown>(COLUMNS_STORAGE_NAME, null)
  if (stored === null) return migrateV1()
  if (
    !isRecord(stored) ||
    stored['schema'] !== COLUMN_PREFS_SCHEMA ||
    !isRecord(stored['overrides'])
  ) {
    return {}
  }
  return sanitize(stored['overrides'])
}

export function useColumnVisibility({
  tier,
  changesAvailable,
  sinceActive,
  reveal,
}: UseColumnVisibilityOptions): ColumnVisibilityApi {
  const [overrides, setOverrides] =
    useState<ColumnOverrides>(loadColumnOverrides)
  const defaults = useMemo(() => tierDefaults(tier), [tier])

  /** Ids this table offers right now, in table order. */
  const offeredIds = useMemo(
    () => [
      ...BASE_COLUMN_IDS,
      ...(sinceActive ? [SINCE_COLUMN_ID] : []),
      ...(changesAvailable ? CHANGES_COLUMN_IDS : []),
    ],
    [changesAvailable, sinceActive]
  )

  const revealKey = (reveal ?? []).join('|')

  /** Offered, toggleable columns the sort or a filter needs but that are off. */
  const revealed = useMemo(() => {
    const out = new Set<string>()
    for (const id of revealKey ? revealKey.split('|') : []) {
      if (
        isToggleable(id) &&
        offeredIds.includes(id) &&
        !(overrides[id] ?? defaults[id] ?? false)
      ) {
        out.add(id)
      }
    }
    return out
  }, [revealKey, offeredIds, overrides, defaults])

  /** Offered, toggleable columns the sort or a filter needs, shown or not. */
  const needed = useMemo(() => {
    const out = new Set<string>()
    for (const id of revealKey ? revealKey.split('|') : []) {
      if (isToggleable(id) && offeredIds.includes(id)) out.add(id)
    }
    return out
  }, [revealKey, offeredIds])

  const visibility = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const id of Object.keys(columnMeta)) {
      if (id === ALWAYS_SHOWN_COLUMN_ID) out[id] = true
      else if (id === SINCE_COLUMN_ID) out[id] = sinceActive
      else if ((CHANGES_COLUMN_IDS as readonly string[]).includes(id))
        out[id] = changesAvailable && (overrides[id] ?? defaults[id] ?? false)
      else out[id] = overrides[id] ?? defaults[id] ?? false
      if (revealed.has(id)) out[id] = true
    }
    return out
  }, [overrides, defaults, changesAvailable, sinceActive, revealed])

  const commit = useCallback((next: ColumnOverrides) => {
    setOverrides(next)
    persist(next)
  }, [])

  const setVisible = useCallback(
    (id: string, next: boolean) => {
      if (!isToggleable(id) || revealed.has(id)) return
      const updated = { ...overrides }
      if (next === defaults[id]) delete updated[id]
      else updated[id] = next
      commit(updated)
    },
    [overrides, defaults, revealed, commit]
  )

  const toggle = useCallback(
    (id: string) => setVisible(id, !visibility[id]),
    [setVisible, visibility]
  )

  const showAll = useCallback(() => {
    const updated = { ...overrides }
    for (const id of offeredIds) {
      if (!isToggleable(id)) continue
      if (defaults[id]) delete updated[id]
      else updated[id] = true
    }
    commit(updated)
  }, [overrides, offeredIds, defaults, commit])

  const reset = useCallback(() => commit({}), [commit])

  const isVisible = useCallback(
    (id: string) => visibility[id] === true,
    [visibility]
  )

  // A revealed column is a view of the URL, not a choice: it is not "custom".
  const isCustom = offeredIds.some(
    id =>
      isToggleable(id) && !revealed.has(id) && visibility[id] !== defaults[id]
  )
  const shownCount = offeredIds.filter(id => visibility[id]).length

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
    shownCount,
    totalCount: offeredIds.length,
  }
}
