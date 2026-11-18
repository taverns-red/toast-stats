import { describe, it, expect } from 'vitest'
import { MissingCdnTargetError, requireCdnTarget } from '../cdnTarget.js'

describe('requireCdnTarget (#2974)', () => {
  it('throws, naming the script, when nothing is set', () => {
    expect(() => requireCdnTarget('x.ts', {})).toThrow(MissingCdnTargetError)
    expect(() => requireCdnTarget('x.ts', {})).toThrow(/x\.ts.*CDN_BASE_URL/)
  })

  it('treats an empty or blank value as missing', () => {
    expect(() => requireCdnTarget('x.ts', { CDN_BASE_URL: '' })).toThrow()
    expect(() => requireCdnTarget('x.ts', { CDN_BASE_URL: '  ' })).toThrow()
    expect(() => requireCdnTarget('x.ts', {}, '')).toThrow()
  })

  it('reads the env variable and strips trailing slashes', () => {
    expect(
      requireCdnTarget('x.ts', { CDN_BASE_URL: 'https://cdn.example/' })
    ).toBe('https://cdn.example')
  })

  it('lets the flag win over the env variable', () => {
    expect(
      requireCdnTarget('x.ts', { CDN_BASE_URL: 'https://a' }, 'https://b')
    ).toBe('https://b')
  })
})
