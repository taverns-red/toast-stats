import { describe, it, expect } from 'vitest'
import {
  bundleCdnBaseUrl,
  MissingCdnTargetError,
  requireCdnTarget,
  resolveBuildCdnTarget,
} from '../cdnTarget.js'

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

  it('treats an empty or blank flag as unset, so the env value is used', () => {
    const env = { CDN_BASE_URL: 'https://a' }
    expect(requireCdnTarget('x.ts', env, '')).toBe('https://a')
    expect(requireCdnTarget('x.ts', env, '  ')).toBe('https://a')
  })
})

describe('resolveBuildCdnTarget (#2982)', () => {
  const PROD = 'https://cdn.taverns.red'

  it('uses VITE_CDN_BASE_URL, trimmed, in CI or not', () => {
    for (const CI of [undefined, 'true']) {
      expect(
        resolveBuildCdnTarget(
          'x.ts',
          { CI, VITE_CDN_BASE_URL: ' https://cdn-staging.taverns.red/ ' },
          PROD
        )
      ).toEqual({ url: 'https://cdn-staging.taverns.red', source: 'env' })
    }
  })

  it('falls back to prod for a local build and says so', () => {
    expect(resolveBuildCdnTarget('x.ts', {}, PROD)).toEqual({
      url: PROD,
      source: 'local-default',
    })
    expect(
      resolveBuildCdnTarget(
        'x.ts',
        { CI: 'false', VITE_CDN_BASE_URL: '' },
        PROD
      ).source
    ).toBe('local-default')
  })

  it('rejects a target that is not an absolute http(s) URL (#2987)', () => {
    for (const CI of [undefined, 'true']) {
      for (const bad of [
        'cdn-staging.taverns.red',
        '/v1',
        'ftp://cdn.taverns.red',
        'https://',
        'not a url',
      ]) {
        expect(() =>
          resolveBuildCdnTarget('x.ts', { CI, VITE_CDN_BASE_URL: bad }, PROD)
        ).toThrow(/x\.ts.*VITE_CDN_BASE_URL.*http/)
      }
    }
  })

  it('accepts http and https targets (#2987)', () => {
    expect(
      resolveBuildCdnTarget(
        'x.ts',
        { VITE_CDN_BASE_URL: 'http://localhost:8080/' },
        PROD
      ).url
    ).toBe('http://localhost:8080')
  })

  it('treats any non-empty CI except false/0 as CI (#2987)', () => {
    for (const CI of ['true', '1', 'TRUE', ' yes ', 'github', 'on']) {
      expect(() =>
        resolveBuildCdnTarget('x.ts', { CI, VITE_CDN_BASE_URL: '' }, PROD)
      ).toThrow(/VITE_CDN_BASE_URL/)
    }
    for (const CI of ['false', '0', ' False ', '', '  ', undefined]) {
      expect(
        resolveBuildCdnTarget('x.ts', { CI, VITE_CDN_BASE_URL: '' }, PROD)
          .source
      ).toBe('local-default')
    }
  })

  it('refuses in CI with no target, naming the variable', () => {
    for (const CI of ['true', '1']) {
      expect(() =>
        resolveBuildCdnTarget('x.ts', { CI, VITE_CDN_BASE_URL: ' ' }, PROD)
      ).toThrow(/x\.ts.*VITE_CDN_BASE_URL/)
    }
  })
})

describe('bundleCdnBaseUrl (#3000)', () => {
  // The value vite.config.ts bakes into the bundle. The plugin logs the same
  // value, so the log can no longer disagree with the bundle.
  const PROD = 'https://cdn.taverns.red'

  it('is the prod URL when nothing is set', () => {
    expect(bundleCdnBaseUrl(undefined, PROD)).toBe(PROD)
    expect(bundleCdnBaseUrl('', PROD)).toBe(PROD)
  })

  it('treats a whitespace-only value as unset, not as a URL', () => {
    expect(bundleCdnBaseUrl('   ', PROD)).toBe(PROD)
  })

  it('trims the value and its trailing slashes', () => {
    expect(bundleCdnBaseUrl(' https://cdn-staging.taverns.red/ ', PROD)).toBe(
      'https://cdn-staging.taverns.red'
    )
  })
})
