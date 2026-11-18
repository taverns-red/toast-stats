/**
 * #2994: the frontend bundle must not fall back to the prod CDN quietly in
 * CI. A Vite plugin applies the same rules as the OG-stub step
 * (resolveBuildCdnTarget) to `vite build`, reading the process env only.
 */

import { describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { cdnTargetPlugin } from '../viteCdnTargetPlugin.js'
import { findProdCdnUses, stripComments } from '../prodCdnScan.js'

const PROD = 'https://cdn.taverns.red'

function run(
  env: Record<string, string | undefined>,
  bundleUrl?: string
): void {
  const plugin = cdnTargetPlugin(env, PROD, bundleUrl)
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

  // #3000: the log must name the value the bundle really gets. A .env file
  // (for example .env.production.local) can set it when the process env does
  // not, and a whitespace-only value is not a URL.
  it('names the CDN the bundle really uses when a .env file sets it', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      run({}, 'https://cdn-staging.taverns.red')
      const said = String(err.mock.calls[0]?.[0])
      expect(said).toContain('https://cdn-staging.taverns.red')
      expect(said).not.toContain(PROD)
    } finally {
      err.mockRestore()
    }
  })

  it('names the prod CDN when the only value is whitespace', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      run({ VITE_CDN_BASE_URL: '   ' }, PROD)
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

  // The prod CDN is named in one place, and vite.config.ts bakes it into the
  // bundle. These are the files that may name it anyway, with the reason.
  const MAY_NAME_PROD_CDN: Record<string, string> = {
    'frontend/src/content/howToVideos.ts':
      'how-to videos are published to the prod bucket only (#2310), whatever CDN the data comes from',
  }

  it('no frontend source file names the prod CDN, in any quoting or constant (#3000)', () => {
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== '__tests__') walk(p)
        } else if (
          /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) &&
          !/\.(test|spec)\./.test(e.name)
        ) {
          const rel = path.relative(root, p).split(path.sep).join('/')
          if (rel in MAY_NAME_PROD_CDN) continue
          if (findProdCdnUses(fs.readFileSync(p, 'utf8')).length > 0)
            offenders.push(rel)
        }
      }
    }
    walk(path.join(root, 'frontend/src'))
    expect(offenders).toEqual([])
  })

  it('every allowed prod CDN file still names it, with a reason', () => {
    for (const [rel, why] of Object.entries(MAY_NAME_PROD_CDN)) {
      expect(why.trim()).not.toBe('')
      expect(findProdCdnUses(read(rel)).length, rel).toBeGreaterThan(0)
    }
  })

  // #3000: Node loads vite.config.ts, where `import.meta.env` does not exist.
  // A browser module that reads it is safe there only while nothing calls it
  // at load time, and `tsc -p tsconfig.node.json` flags it (TS2339).
  it('vite.config.ts imports no module that reads import.meta.env (#3000)', () => {
    const seen = new Set<string>()
    const readers: string[] = []
    const visit = (file: string): void => {
      if (seen.has(file)) return
      seen.add(file)
      // Comments may explain why; only code counts.
      const text = stripComments(fs.readFileSync(file, 'utf8'))
      if (/import\.meta\.env/.test(text))
        readers.push(path.relative(root, file).split(path.sep).join('/'))
      for (const m of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const base = path.resolve(path.dirname(file), m[1]!)
        const next = ['', '.ts', '.tsx', '.js', '/index.ts']
          .map(ext => base + ext)
          .find(f => fs.existsSync(f) && fs.statSync(f).isFile())
        if (next) visit(next)
      }
    }
    visit(path.join(root, 'frontend/vite.config.ts'))
    expect(readers).toEqual([])
  })
})

describe('findProdCdnUses (#3000)', () => {
  it.each([
    ['single quotes', "const a = 'https://cdn.taverns.red'"],
    ['double quotes', 'const a = "https://cdn.taverns.red"'],
    ['backticks', 'const a = `https://cdn.taverns.red`'],
    ['a path after the host', "const a = 'https://cdn.taverns.red/videos'"],
    ['a fallback', "const a = env.X || 'https://cdn.taverns.red'"],
    ['a named constant', 'export const PROD_CDN = "https://cdn.taverns.red"'],
    ['a bare host', "const h = 'cdn.taverns.red'"],
  ])('flags %s', (_name, src) => {
    expect(findProdCdnUses(src).length).toBeGreaterThan(0)
  })

  it('ignores comments', () => {
    expect(
      findProdCdnUses(
        '// reads from https://cdn.taverns.red\n/* cdn.taverns.red */\nconst a = 1'
      )
    ).toEqual([])
  })

  it('ignores the staging CDN', () => {
    expect(
      findProdCdnUses("const a = 'https://cdn-staging.taverns.red'")
    ).toEqual([])
  })
})
