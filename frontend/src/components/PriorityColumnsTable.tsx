import React from 'react'
import type { SortDirection } from '../hooks/useUrlSort'

/* #1834 — stub (red commit). */

export interface PriorityMetric<Row, F extends string> {
  id: string
  label: string
  title?: string
  render: (row: Row) => React.ReactNode
  sortField?: F
}

export interface PriorityColumnsTableProps<Row, F extends string> {
  label: string
  rows: readonly Row[]
  rowKey: (row: Row) => string
  identityHeader: string
  renderIdentity: (row: Row) => React.ReactNode
  identitySortField?: F
  metrics: readonly PriorityMetric<Row, F>[]
  defaultMetricIds: readonly [string, string]
  sort?: { field: F | null; direction: SortDirection }
  onSort?: (field: F) => void
  fullTable: React.ReactNode
  sheetTable?: React.ReactNode
  sheetRegionClassName?: string
  fullTableTitle: string
  colsParam?: string
}

export function PriorityColumnsTable<Row, F extends string>(
  props: PriorityColumnsTableProps<Row, F>
): React.JSX.Element {
  return <>{props.fullTable}</>
}

export default PriorityColumnsTable
