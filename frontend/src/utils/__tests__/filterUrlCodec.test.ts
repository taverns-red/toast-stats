/**
 * Tests for filter URL codec (#272)
 *
 * Serializes/deserializes FilterState to/from URL search params.
 * Format: f_name=toast, f_status=thriving,vulnerable, f_membership=5-20
 */
import { describe, it, expect } from 'vitest'
import {
  serializeFilterState,
  parseFilterState,
  FILTER_URL_PREFIX,
} from '../filterUrlCodec'
import type { FilterState } from '../../components/filters/types'

describe('filterUrlCodec (#272)', () => {
  describe('serializeFilterState', () => {
    it('should return empty object for empty filter state', () => {
      expect(serializeFilterState({})).toEqual({})
    })

    it('should serialize text filter', () => {
      const state: FilterState = {
        name: {
          field: 'name',
          type: 'text',
          value: 'toast',
          operator: 'contains',
        },
      }
      expect(serializeFilterState(state)).toEqual({
        [`${FILTER_URL_PREFIX}name`]: 'toast',
      })
    })

    it('should serialize categorical filter with multiple values', () => {
      const state: FilterState = {
        status: {
          field: 'status',
          type: 'categorical',
          value: ['thriving', 'vulnerable'],
          operator: 'in',
        },
      }
      expect(serializeFilterState(state)).toEqual({
        [`${FILTER_URL_PREFIX}status`]: 'thriving,vulnerable',
      })
    })

    it('should serialize numeric range filter', () => {
      const state: FilterState = {
        membership: {
          field: 'membership',
          type: 'numeric',
          value: [5, 20],
          operator: 'range',
        },
      }
      expect(serializeFilterState(state)).toEqual({
        [`${FILTER_URL_PREFIX}membership`]: '5-20',
      })
    })

    it('should serialize numeric range with null min', () => {
      const state: FilterState = {
        membership: {
          field: 'membership',
          type: 'numeric',
          value: [null, 20],
          operator: 'range',
        },
      }
      expect(serializeFilterState(state)).toEqual({
        [`${FILTER_URL_PREFIX}membership`]: '-20',
      })
    })

    it('should serialize numeric range with null max', () => {
      const state: FilterState = {
        membership: {
          field: 'membership',
          type: 'numeric',
          value: [5, null],
          operator: 'range',
        },
      }
      expect(serializeFilterState(state)).toEqual({
        [`${FILTER_URL_PREFIX}membership`]: '5-',
      })
    })

    it('should skip null filters', () => {
      const state: FilterState = {
        name: null,
        status: {
          field: 'status',
          type: 'categorical',
          value: ['thriving'],
          operator: 'in',
        },
      }
      expect(serializeFilterState(state)).toEqual({
        [`${FILTER_URL_PREFIX}status`]: 'thriving',
      })
    })

    it('should skip empty text filters', () => {
      const state: FilterState = {
        name: {
          field: 'name',
          type: 'text',
          value: '',
          operator: 'contains',
        },
      }
      expect(serializeFilterState(state)).toEqual({})
    })

    it('should serialize multiple filters', () => {
      const state: FilterState = {
        name: {
          field: 'name',
          type: 'text',
          value: 'toast',
          operator: 'contains',
        },
        status: {
          field: 'status',
          type: 'categorical',
          value: ['thriving'],
          operator: 'in',
        },
      }
      const result = serializeFilterState(state)
      expect(result).toEqual({
        [`${FILTER_URL_PREFIX}name`]: 'toast',
        [`${FILTER_URL_PREFIX}status`]: 'thriving',
      })
    })
  })

  describe('parseFilterState', () => {
    it('should return empty state when no filter params', () => {
      const params = new URLSearchParams('tab=clubs&sort=name')
      expect(parseFilterState(params)).toEqual({})
    })

    it('should parse text filter', () => {
      const params = new URLSearchParams(`${FILTER_URL_PREFIX}name=toast`)
      const state = parseFilterState(params)
      expect(state.name).toEqual({
        field: 'name',
        type: 'text',
        value: 'toast',
        operator: 'contains',
      })
    })

    it('should parse categorical filter', () => {
      const params = new URLSearchParams(
        `${FILTER_URL_PREFIX}status=thriving,vulnerable`
      )
      const state = parseFilterState(params)
      expect(state.status).toEqual({
        field: 'status',
        type: 'categorical',
        value: ['thriving', 'vulnerable'],
        operator: 'in',
      })
    })

    it('should parse numeric range filter', () => {
      const params = new URLSearchParams(`${FILTER_URL_PREFIX}membership=5-20`)
      const state = parseFilterState(params)
      expect(state.membership).toEqual({
        field: 'membership',
        type: 'numeric',
        value: [5, 20],
        operator: 'range',
      })
    })

    it('should parse numeric range with open min', () => {
      const params = new URLSearchParams(`${FILTER_URL_PREFIX}membership=-20`)
      const state = parseFilterState(params)
      expect(state.membership).toEqual({
        field: 'membership',
        type: 'numeric',
        value: [null, 20],
        operator: 'range',
      })
    })

    it('should parse numeric range with open max', () => {
      const params = new URLSearchParams(`${FILTER_URL_PREFIX}membership=5-`)
      const state = parseFilterState(params)
      expect(state.membership).toEqual({
        field: 'membership',
        type: 'numeric',
        value: [5, null],
        operator: 'range',
      })
    })

    it('should ignore unknown filter fields', () => {
      const params = new URLSearchParams(`${FILTER_URL_PREFIX}unknown=foo`)
      expect(parseFilterState(params)).toEqual({})
    })

    it('should ignore non-filter params', () => {
      const params = new URLSearchParams(
        `tab=clubs&sort=name&${FILTER_URL_PREFIX}name=toast`
      )
      const state = parseFilterState(params)
      expect(Object.keys(state)).toEqual(['name'])
    })
  })

  describe('round-trip', () => {
    it('should round-trip text filter', () => {
      const original: FilterState = {
        name: {
          field: 'name',
          type: 'text',
          value: 'toast',
          operator: 'contains',
        },
      }
      const serialized = serializeFilterState(original)
      const params = new URLSearchParams(serialized)
      expect(parseFilterState(params)).toEqual(original)
    })

    it('should round-trip categorical filter', () => {
      const original: FilterState = {
        status: {
          field: 'status',
          type: 'categorical',
          value: ['thriving', 'vulnerable'],
          operator: 'in',
        },
      }
      const serialized = serializeFilterState(original)
      const params = new URLSearchParams(serialized)
      expect(parseFilterState(params)).toEqual(original)
    })

    it('should round-trip numeric range filter', () => {
      const original: FilterState = {
        membership: {
          field: 'membership',
          type: 'numeric',
          value: [5, 20],
          operator: 'range',
        },
      }
      const serialized = serializeFilterState(original)
      const params = new URLSearchParams(serialized)
      expect(parseFilterState(params)).toEqual(original)
    })

    it('should round-trip complex filter state', () => {
      const original: FilterState = {
        name: {
          field: 'name',
          type: 'text',
          value: 'toast',
          operator: 'contains',
        },
        status: {
          field: 'status',
          type: 'categorical',
          value: ['thriving'],
          operator: 'in',
        },
        membership: {
          field: 'membership',
          type: 'numeric',
          value: [10, null],
          operator: 'range',
        },
      }
      const serialized = serializeFilterState(original)
      const params = new URLSearchParams(serialized)
      expect(parseFilterState(params)).toEqual(original)
    })
  })
})
