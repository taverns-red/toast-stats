import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import playwrightConfig from '../../../playwright.config'
import { describeErrorResponse } from '../../../e2e/helpers/errorResponses'

/**
 * Contract: a failed preview smoke leaves evidence behind (#2248).
 *
 * Run 40050767724 lost the WebKit app partway through: every later WebKit
 * test failed and the landing page logged a bare `Failed to load resource:
 * ... 404`. Nothing recorded which URL 404'd, so the cause could not be
 * named. These diagnostics change no pass/fail behaviour:
 *   (a) on failure the job uploads frontend/test-results/ (screenshots and
 *       first-retry traces) with a short retention;
 *   (b) the shared smoke fixture records every response with status >= 400
 *       as `status host+path` (no query string or hash, which can carry
 *       personal data) and attaches the list to the test result, so the
 *       reporter prints it under the failing test in the job log.
 */

function repoFile(rel: string): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, rel)
    if (existsSync(candidate)) return candidate
    dir = dirname(dir)
  }
  throw new Error(`could not locate ${rel} walking up from ${process.cwd()}`)
}

/** Split the workflow into its `- name:` step blocks (6-space indent). */
function steps(wf: string): string[] {
  return wf.split(/\n(?= {6}- name: )/).slice(1)
}

describe('preview smoke failure diagnostics (#2248)', () => {
  const wf = readFileSync(repoFile('.github/workflows/pr-preview.yml'), 'utf8')
  const all = steps(wf)
  const uploadIdx = all.findIndex(s =>
    /uses: actions\/upload-artifact@/.test(s)
  )
  const upload = all[uploadIdx] ?? ''

  it('uploads the Playwright results only when the job fails', () => {
    expect(uploadIdx, 'an upload-artifact step must exist').toBeGreaterThan(-1)
    expect(upload).toMatch(/\n\s+if: failure\(\)/)
    expect(upload).toMatch(/\n\s+path: frontend\/test-results\/?\n/)
    expect(upload).toMatch(/\n\s+if-no-files-found: ignore/)
  })

  it('keeps the artifact for a short time', () => {
    const days = Number(/\n\s+retention-days: (\d+)/.exec(upload)?.[1])
    expect(days).toBeGreaterThan(0)
    expect(days).toBeLessThanOrEqual(7)
  })

  it('runs after every Playwright step, so it sees the failing one', () => {
    const lastPlaywright = all.reduce(
      (last, s, i) => (/playwright test/.test(s) ? i : last),
      -1
    )
    expect(lastPlaywright).toBeGreaterThan(-1)
    expect(uploadIdx).toBeGreaterThan(lastPlaywright)
  })

  it('names the artifact per attempt, so a re-run does not collide', () => {
    expect(upload).toMatch(/\n\s+name: [^\n]*\$\{\{ github\.run_attempt \}\}/)
  })

  it('records a trace on the first retry only', () => {
    expect(playwrightConfig.use?.trace).toBe('on-first-retry')
  })

  it('the shared smoke fixture logs error responses automatically', () => {
    const fixture = readFileSync(
      repoFile('frontend/e2e/fixtures/test.ts'),
      'utf8'
    )
    expect(fixture).toMatch(/describeErrorResponse/)
    expect(fixture).toMatch(/context\.on\('response'/)
    expect(fixture).toMatch(/testInfo\.attach\(\s*'error-responses'/)
    expect(fixture).toMatch(/errorResponses: \[[\s\S]*?\{ auto: true \}/)
  })
})

describe('describeErrorResponse (#2248)', () => {
  it('ignores responses below 400', () => {
    expect(describeErrorResponse('https://a.web.app/', 200)).toBeNull()
    expect(describeErrorResponse('https://a.web.app/x', 304)).toBeNull()
    expect(describeErrorResponse('https://a.web.app/x', 399)).toBeNull()
  })

  it('reports status, host and path for 4xx and 5xx', () => {
    expect(
      describeErrorResponse('https://pr-1--site.web.app/assets/a.js', 404)
    ).toBe('404 pr-1--site.web.app/assets/a.js')
    expect(
      describeErrorResponse('https://cdn.example/v1/latest.json', 503)
    ).toBe('503 cdn.example/v1/latest.json')
  })

  it('drops the query string and hash', () => {
    expect(
      describeErrorResponse(
        'https://cdn.example/club?name=Jane+Doe&email=j@x.org#me',
        404
      )
    ).toBe('404 cdn.example/club')
  })

  it('does not throw on a URL it cannot parse', () => {
    expect(describeErrorResponse('not a url?secret=1', 500)).toBe(
      '500 (unparseable URL)'
    )
  })
})
