/**
 * Clubs table column metadata (#2676, spec §4.1). Skeleton: filled in by the
 * green commit.
 */

export type BreakpointTier = 'tablet' | 'laptop' | 'desktop' | 'wide'

export type ColumnChooserGroup =
  | 'club'
  | 'health'
  | 'membership'
  | 'renewals'
  | 'recognition'
  | 'comparison'
  | 'changes'

export interface ClubColumnMeta {
  group: ColumnChooserGroup
  /** Full column name for the Columns menu. */
  label: string
  /** One-line hint under the label. */
  hint: string
  /** Fixed width in px (Club takes the remainder; see NAME_MIN_SIZE). */
  size: number
  defaultVisible: Readonly<Record<BreakpointTier, boolean>>
}

export const columnMeta: Readonly<Record<string, ClubColumnMeta>> = {}

export const NAME_MIN_SIZE = 180

export const TIER_BUDGET_PX: Readonly<Record<BreakpointTier, number>> = {
  tablet: 682,
  laptop: 938,
  desktop: 1177,
  wide: 1514,
}

export const tierDefaults = (
  _tier: BreakpointTier
): Record<string, boolean> => ({})
