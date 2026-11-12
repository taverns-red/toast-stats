/**
 * Clubs table column visibility (#2676, spec §4.4). Skeleton: the green
 * commit implements it.
 */

import type { BreakpointTier } from '../components/clubsColumnMeta'

export const COLUMNS_STORAGE_NAME = 'clubs-table:columns'
export const COLUMN_PREFS_SCHEMA = 2

export type ColumnOverrides = Record<string, boolean>

export interface UseColumnVisibilityOptions {
  tier: BreakpointTier
  /** A snapshot diff is loaded, so the Changes columns can be offered. */
  changesAvailable: boolean
  /** The `?since=` preset is on, so "vs last year" is present. */
  sinceActive: boolean
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
  /** The shown set differs from this width's default. */
  isCustom: boolean
  shownCount: number
  totalCount: number
}

/** Read the stored overrides, migrating the v1 keys once (spec §4.4). */
export function loadColumnOverrides(): ColumnOverrides {
  return {}
}

export function useColumnVisibility(
  _opts: UseColumnVisibilityOptions
): ColumnVisibilityApi {
  return {
    visibility: {},
    overrides: {},
    isVisible: () => false,
    setVisible: () => {},
    toggle: () => {},
    showAll: () => {},
    reset: () => {},
    isCustom: false,
    shownCount: 0,
    totalCount: 0,
  }
}
