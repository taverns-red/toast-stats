/**
 * Filter URL Codec (#272)
 *
 * Serializes/deserializes FilterState to/from URL search params.
 * Uses f_ prefix to namespace filter params.
 *
 * Format:
 *   Text:        f_name=toast
 *   Categorical: f_status=thriving,vulnerable
 *   Numeric:     f_membership=5-20  (or -20 for open min, 5- for open max)
 */

import { COLUMN_CONFIGS } from '../components/filters/types'
import type {
  ColumnFilter,
  FilterState,
  SortField,
} from '../components/filters/types'

export const FILTER_URL_PREFIX = 'f_'

// Build lookup from field name to filter type
const FIELD_TYPE_MAP = new Map(
  COLUMN_CONFIGS.filter(c => c.filterable).map(c => [c.field, c.filterType])
)

/**
 * Serialize a FilterState to a Record of URL search params.
 * Empty/null filters are omitted.
 */
export function serializeFilterState(
  state: FilterState
): Record<string, string> {
  const params: Record<string, string> = {}

  for (const [field, filter] of Object.entries(state)) {
    if (!filter) continue

    const serialized = serializeFilter(filter)
    if (serialized) {
      params[`${FILTER_URL_PREFIX}${field}`] = serialized
    }
  }

  return params
}

function serializeFilter(filter: ColumnFilter): string | null {
  switch (filter.type) {
    case 'text': {
      const val = filter.value as string
      return val ? val : null
    }
    case 'categorical': {
      const vals = filter.value as string[]
      return vals.length > 0 ? vals.join(',') : null
    }
    case 'numeric': {
      const range = filter.value as (number | null)[]
      const min = range[0] ?? null
      const max = range[1] ?? null
      if (min === null && max === null) return null
      const minStr = min !== null ? min.toString() : ''
      const maxStr = max !== null ? max.toString() : ''
      return `${minStr}-${maxStr}`
    }
    default:
      return null
  }
}

/**
 * Parse FilterState from URL search params.
 * Only recognizes params with the f_ prefix and known field names.
 */
export function parseFilterState(params: URLSearchParams): FilterState {
  const state: FilterState = {}

  params.forEach((value, key) => {
    if (!key.startsWith(FILTER_URL_PREFIX)) return

    const field = key.slice(FILTER_URL_PREFIX.length) as SortField
    const filterType = FIELD_TYPE_MAP.get(field)
    if (!filterType) return

    const filter = parseFilter(field, filterType, value)
    if (filter) {
      state[field] = filter
    }
  })

  return state
}

function parseFilter(
  field: SortField,
  type: 'text' | 'numeric' | 'categorical',
  raw: string
): ColumnFilter | null {
  if (!raw) return null

  switch (type) {
    case 'text':
      return { field, type, value: raw, operator: 'contains' }

    case 'categorical':
      return {
        field,
        type,
        value: raw.split(',').filter(Boolean),
        operator: 'in',
      }

    case 'numeric': {
      // Format: "min-max", "-max" (open min), "min-" (open max)
      // Find the separator dash (always present for valid range)
      const dashIdx = raw.indexOf('-')
      if (dashIdx === -1) return null

      const minStr = raw.slice(0, dashIdx)
      const maxStr = raw.slice(dashIdx + 1)
      const min = minStr ? Number(minStr) : null
      const max = maxStr ? Number(maxStr) : null

      if (min !== null && isNaN(min)) return null
      if (max !== null && isNaN(max)) return null

      return { field, type, value: [min, max], operator: 'range' }
    }

    default:
      return null
  }
}
