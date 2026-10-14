/**
 * Guard (#2010) — the Playwright smokes must not silently fall back to a
 * default target.
 *
 * The old default, `https://staging-toast-stats.web.app`, was the live channel
 * of the staging site. Nothing has deployed it since 2026-05-25 (only per-PR
 * `pr-<N>` channels are updated now), so a smoke run without BASE_URL tested a
 * five-month-old build and failed on routes it predates. Every CI invocation
 * sets BASE_URL to the preview channel URL, so the decision is to require it
 * and fail fast with a message naming the two real targets: prod and a local
 * `vite preview`.
 *
 * The real config is imported too, so the guard proves the wiring and not only
 * the helper (R20 spirit: assert against the tool's own resolution).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveBaseUrl } from '../../../e2e/helpers/baseUrl'

describe('resolveBaseUrl (#2010)', () => {
  it('returns BASE_URL when it is set', () => {
    expect(resolveBaseUrl({ BASE_URL: 'https://ts.taverns.red' })).toBe(
      'https://ts.taverns.red'
    )
  })

  it('throws when BASE_URL is unset', () => {
    expect(() => resolveBaseUrl({})).toThrow(/BASE_URL is required/)
  })

  it('throws when BASE_URL is empty or whitespace', () => {
    expect(() => resolveBaseUrl({ BASE_URL: '' })).toThrow(
      /BASE_URL is required/
    )
    expect(() => resolveBaseUrl({ BASE_URL: '   ' })).toThrow(
      /BASE_URL is required/
    )
  })

  it('names prod and vite preview as the options', () => {
    expect(() => resolveBaseUrl({})).toThrow(/https:\/\/ts\.taverns\.red/)
    expect(() => resolveBaseUrl({})).toThrow(/vite preview/)
  })

  it('never falls back to the stale staging live channel', () => {
    let message = ''
    try {
      resolveBaseUrl({})
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toMatch(/staging-toast-stats\.web\.app/)
  })
})

describe('playwright.config.ts wiring (#2010)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('fails to load without BASE_URL', async () => {
    vi.stubEnv('BASE_URL', '')
    vi.resetModules()
    await expect(import('../../../playwright.config')).rejects.toThrow(
      /BASE_URL is required/
    )
  })

  it('uses BASE_URL as baseURL when set', async () => {
    vi.stubEnv('BASE_URL', 'http://localhost:4173')
    vi.resetModules()
    const { default: config } = await import('../../../playwright.config')
    expect(config.use?.baseURL).toBe('http://localhost:4173')
  })
})
