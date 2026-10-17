/**
 * Region id normalisation (#2130). Rankings and region-rollups key regions
 * as two-digit strings ("01".."14"), so `/region/1` must read as "01".
 */
import { describe, it, expect } from 'vitest'
import { canonicalRegionPath, normaliseRegionId } from '../regionId'

describe('normaliseRegionId', () => {
  it.each([
    ['1', '01'],
    ['01', '01'],
    ['7', '07'],
    ['14', '14'],
    ['001', '01'],
    [' 3 ', '03'],
  ])('pads numeric id %j to %j', (raw, expected) => {
    expect(normaliseRegionId(raw)).toBe(expected)
  })

  it('leaves a non-numeric id as-is (trimmed)', () => {
    expect(normaliseRegionId(' DNAR ')).toBe('DNAR')
  })

  it('treats a missing id as empty', () => {
    expect(normaliseRegionId(undefined)).toBe('')
  })
})

describe('canonicalRegionPath', () => {
  it('rewrites only the region segment, keeping subpath, query and hash', () => {
    expect(
      canonicalRegionPath(
        { pathname: '/region/1/health', search: '?py=2025&date=x', hash: '#k' },
        '01'
      )
    ).toBe('/region/01/health?py=2025&date=x#k')
  })

  it('rewrites the landing path', () => {
    expect(
      canonicalRegionPath({ pathname: '/region/7', search: '', hash: '' }, '07')
    ).toBe('/region/07')
  })
})
