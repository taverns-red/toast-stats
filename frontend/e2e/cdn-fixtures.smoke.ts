import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from './fixtures/test'
import { CDN_STAGING_ORIGIN, installCdnFixtures } from './helpers/cdnFixtures'

/* The CDN fixture (#2545) is a CONTEXT route. A spec that mocks one file with
 * `page.route` must still win over it, in both engines, or every existing
 * per-spec mock would silently stop working once the shards read fixtures.
 * This runs in a real browser because the precedence is Playwright's, not
 * ours: a fake route cannot prove it. It needs no CDN and no app build; it
 * answers its own fixtures from a temp directory. */

test.describe('CDN fixtures and per-spec routes (#2545)', () => {
  test('a page.route override wins; the fixture serves the rest; a miss fails loudly', async ({
    browser,
  }) => {
    const dir = mkdtempSync(join(tmpdir(), '2545-spec-fixtures-'))
    try {
      mkdirSync(join(dir, 'v1'), { recursive: true })
      writeFileSync(join(dir, 'v1', 'latest.json'), '{"from":"fixture"}')
      writeFileSync(join(dir, 'v1', 'dates.json'), '{"from":"fixture"}')
      writeFileSync(
        join(dir, '_index.json'),
        JSON.stringify({
          'v1/latest.json': { status: 200, contentType: 'application/json' },
          'v1/dates.json': { status: 200, contentType: 'application/json' },
        })
      )
      const context = await browser.newContext()
      const tally = await installCdnFixtures(context, { dir })
      const page = await context.newPage()
      await page.route(`${CDN_STAGING_ORIGIN}/v1/latest.json`, route =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: '{"from":"spec"}',
        })
      )
      await page.goto('about:blank')
      const get = (path: string) =>
        page.evaluate(async url => {
          try {
            return await (await fetch(url)).text()
          } catch {
            return 'network-error'
          }
        }, `${CDN_STAGING_ORIGIN}/${path}`)

      expect(await get('v1/latest.json')).toBe('{"from":"spec"}')
      expect(await get('v1/dates.json')).toBe('{"from":"fixture"}')
      expect(await get('v1/missing.json')).toBe('network-error')
      expect(tally.hits).toEqual(['v1/dates.json'])
      expect(tally.misses).toEqual(['v1/missing.json'])
      await context.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
