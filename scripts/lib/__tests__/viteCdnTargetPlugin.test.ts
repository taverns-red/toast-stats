/**
 * #2994: the frontend bundle must not fall back to the prod CDN quietly in
 * CI. A Vite plugin applies the same rules as the OG-stub step
 * (resolveBuildCdnTarget) to `vite build`, reading the process env only.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { cdnTargetPlugin } from '../viteCdnTargetPlugin.js'

const PROD = 'https://cdn.taverns.red'

function run(env: Record<string, string | undefined>): void {
  const plugin = cdnTargetPlugin(env, PROD)
  ;(plugin.buildStart as () => void)()
}

describe('cdnTargetPlugin', () => {
  it('applies to vite build only, not dev or vitest', () => {
    expect(cdnTargetPlugin({}, PROD).apply).toBe('build')
  })

  it('fails the build in CI when the target is unset', () => {
    expect(() => run({ CI: 'true' })).toThrow(/VITE_CDN_BASE_URL/)
  })

  it('fails the build in CI when the target is only whitespace', () => {
    expect(() => run({ CI: 'true', VITE_CDN_BASE_URL: '  ' })).toThrow(
      /explicit CDN target/
    )
  })

  it('fails the build when the target is malformed, in CI or not', () => {
    expect(() => run({ VITE_CDN_BASE_URL: 'cdn.taverns.red' })).toThrow(
      /absolute http\(s\) URL/
    )
    expect(() => run({ CI: 'true', VITE_CDN_BASE_URL: 'not a url' })).toThrow(
      /absolute http\(s\) URL/
    )
  })

  it('passes in CI when the target is set', () => {
    expect(() =>
      run({ CI: 'true', VITE_CDN_BASE_URL: 'https://cdn-staging.taverns.red' })
    ).not.toThrow()
  })

  it('passes locally with no target and says so on stderr', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => run({})).not.toThrow()
      expect(err).toHaveBeenCalledWith(expect.stringContaining(PROD))
    } finally {
      err.mockRestore()
    }
  })

  it('treats CI=false and CI=0 as local', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => run({ CI: 'false' })).not.toThrow()
      expect(() => run({ CI: '0' })).not.toThrow()
    } finally {
      err.mockRestore()
    }
  })
})

describe('wiring (#2994)', () => {
  const root = path.resolve(process.cwd())
  const read = (p: string): string =>
    fs.readFileSync(path.join(root, p), 'utf8')

  it('vite.config.ts registers the plugin', () => {
    expect(read('frontend/vite.config.ts')).toMatch(/cdnTargetPlugin\(/)
  })

  it('frontend/.env.production no longer hides a missing target', () => {
    const file = path.join(root, 'frontend/.env.production')
    if (!fs.existsSync(file)) return
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(
      /^\s*VITE_CDN_BASE_URL\s*=/m
    )
  })

  it('no frontend source file hard-codes the prod CDN as a data fallback', () => {
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p)
        } else if (
          /\.(ts|tsx)$/.test(e.name) &&
          !/\.test\./.test(e.name) &&
          /\|\|\s*'https:\/\/cdn\.taverns\.red'/.test(
            fs.readFileSync(p, 'utf8')
          )
        ) {
          offenders.push(path.relative(root, p))
        }
      }
    }
    walk(path.join(root, 'frontend/src'))
    expect(offenders).toEqual([])
  })
})
