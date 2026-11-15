import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2696 — the staging bucket stops serving public reads. Every reader goes
 * through cdn-staging.taverns.red (private origin) or sends a bearer token.
 */

const ROOT = join(__dirname, '..', '..', '..')
const WORKFLOWS = join(ROOT, '.github', 'workflows')

const ECHOES_TOKEN = /echo[^\n]*\$\{?\w*TOKEN/

const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

function cspValues(): string[] {
  const hosting = JSON.parse(read('firebase.json')).hosting as Array<{
    headers?: Array<{ headers: Array<{ key: string; value: string }> }>
  }>
  const out: string[] = []
  for (const target of hosting) {
    for (const rule of target.headers ?? []) {
      for (const h of rule.headers) {
        if (h.key === 'Content-Security-Policy') out.push(h.value)
      }
    }
  }
  return out
}

describe('staging bucket readers (#2696)', () => {
  it('finds a CSP on every hosting target', () => {
    expect(cspValues().length).toBeGreaterThanOrEqual(2)
  })

  it('no CSP allows the storage.googleapis.com origin (staging bucket)', () => {
    for (const csp of cspValues()) {
      expect(csp).not.toContain('storage.googleapis.com')
    }
  })

  it('keeps cdn.taverns.red and cdn-staging.taverns.red in connect-src', () => {
    for (const csp of cspValues()) {
      expect(csp).toMatch(/connect-src[^;]*https:\/\/cdn\.taverns\.red/)
      expect(csp).toMatch(/connect-src[^;]*https:\/\/cdn-staging\.taverns\.red/)
    }
  })

  it('basemap-build.yml: every curl to storage.googleapis.com is authenticated', () => {
    const lines = read('.github/workflows/basemap-build.yml').split('\n')
    let checked = 0
    lines.forEach((line, i) => {
      if (!/storage\.googleapis\.com/.test(line)) return
      // The curl invocation spans the preceding continuation lines.
      let start = i
      while (start > 0 && lines[start - 1]!.trimEnd().endsWith('\\')) start--
      const cmd = lines.slice(start, i + 1).join('\n')
      if (!/\bcurl\b/.test(cmd)) return
      checked++
      expect(cmd).toMatch(/-H ["']Authorization: Bearer /)
    })
    expect(checked).toBeGreaterThan(0)
  })

  it('the token-echo pattern catches an echoed ACCESS_TOKEN (fixture)', () => {
    expect(ECHOES_TOKEN.test('echo "$ACCESS_TOKEN"')).toBe(true)
    expect(ECHOES_TOKEN.test('echo "${ACCESS_TOKEN}"')).toBe(true)
    expect(ECHOES_TOKEN.test('echo "unrelated"')).toBe(false)
  })

  it('basemap-build.yml: never echoes the access token, and masks it', () => {
    const yml = read('.github/workflows/basemap-build.yml')
    // The ::add-mask:: workflow command is the one sanctioned echo.
    const echoes = yml
      .split('\n')
      .filter(l => !l.includes('::add-mask::') && ECHOES_TOKEN.test(l))
    expect(echoes).toEqual([])
    expect(yml).toContain('echo "::add-mask::${ACCESS_TOKEN}"')
  })

  it('no frontend source reads the staging bucket directly', () => {
    const walk = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e => {
        if (e.name === '__tests__' || e.name === 'node_modules') return []
        const rel = join(dir, e.name)
        return e.isDirectory() ? walk(rel) : [rel]
      })
    const offenders = walk(join('frontend', 'src')).filter(f =>
      /storage\.googleapis\.com\/toast-stats-data-staging/.test(read(f))
    )
    expect(offenders).toEqual([])
  })

  it('no workflow reads the staging bucket unauthenticated', () => {
    const files = readdirSync(WORKFLOWS)
      .filter(f => f.endsWith('.yml'))
      .map(f => join('.github', 'workflows', f))
    for (const f of files) {
      const lines = read(f).split('\n')
      lines.forEach((line, i) => {
        if (
          !/storage\.googleapis\.com\/(\$\{?GCS_BUCKET|toast-stats-data-staging)/.test(
            line
          )
        )
          return
        let start = i
        while (start > 0 && lines[start - 1]!.trimEnd().endsWith('\\')) start--
        const cmd = lines.slice(start, i + 1).join('\n')
        const ok = /Authorization: Bearer /.test(cmd)
        expect(ok, `${f}:${i + 1} reads the staging bucket without auth`).toBe(
          true
        )
      })
    }
  })

  it('pr-preview.yml no longer documents a direct-bucket rollback', () => {
    expect(read('.github/workflows/pr-preview.yml')).not.toContain(
      'storage.googleapis.com/toast-stats-data-staging'
    )
  })
})
