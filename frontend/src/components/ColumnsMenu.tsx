import React from 'react'
import type { ColumnVisibilityApi } from '../hooks/useColumnVisibility'

interface ColumnsMenuProps {
  columns: ColumnVisibilityApi
  /** The Changes columns are offered (a snapshot diff is loaded). */
  changesAvailable: boolean
  /** Heading for the Changes group, e.g. "Changes since Nov 10". */
  changesLabel?: string
  /** The `?since=` preset is on, so "vs last year" is listed. */
  sinceActive: boolean
}

/** Skeleton: the green commit renders the control (#2676, spec §4.2). */
export const ColumnsMenu: React.FC<ColumnsMenuProps> = () => null
