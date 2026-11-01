/**
 * agent-cli preview-url and live-version (#2418). Fixtures: the real PR
 * 2416 issue comments (incl. the pr-preview sticky comment), the real
 * https://ts.taverns.red index.html and an excerpt of its entry bundle.
 */
import { describe, it, expect } from 'vitest'
import {
  findPreview,
  parsePreviewComment,
  previewUrl,
  type IssueComment,
} from '../agentCli/previewUrl.js'
import {
  liveVersion,
  parseBundleVersion,
  parseEntryAssets,
  type Fetcher,
} from '../agentCli/liveVersion.js'
import { fakeRunner, fixture, ok, noSleep } from './agentCliFakes.js'

const PAGES = JSON.parse(
  fixture('issue-comments-2416.json')
) as IssueComment[][]
const HTML = fixture('live-index.html')
const ENTRY = fixture('live-entry-excerpt.txt')
const REPO = 'taverns-red/toast-stats'

describe('preview-url', () => {
  it('parses the sticky comment body', () => {
    const body = PAGES.flat().find(c =>
      c.body.includes('Preview deployed')
    )!.body
    expect(parsePreviewComment(body)).toEqual({
      url: 'https://staging-toast-stats--pr-2416-xaopw9hv.web.app',
      expires: '2026-11-06T13:45:40.629469159Z',
    })
  })

  it('finds the preview and says whether it has expired', () => {
    const before = findPreview(PAGES, 2416, Date.parse('2026-11-01T00:00:00Z'))
    expect(before).toMatchObject({
      pr: 2416,
      url: 'https://staging-toast-stats--pr-2416-xaopw9hv.web.app',
      expired: false,
    })
    const after = findPreview(PAGES, 2416, Date.parse('2026-11-07T00:00:00Z'))
    expect(after?.expired).toBe(true)
  })

  it('returns null when the PR has no preview comment', () => {
    expect(findPreview([[]], 1, 0)).toBeNull()
  })

  it('reads every comment page via gh api --paginate --slurp', async () => {
    const runner = fakeRunner([
      [
        /^gh api --paginate --slurp repos\/taverns-red\/toast-stats\/issues\/2416\/comments/,
        ok(JSON.stringify(PAGES)),
      ],
    ])
    const p = await previewUrl(2416, {
      repo: REPO,
      runner,
      sleep: noSleep,
      now: () => 0,
    })
    expect(p?.url).toContain('pr-2416')
  })
})

describe('live-version', () => {
  it('finds the entry script and every same-origin asset', () => {
    const a = parseEntryAssets(HTML)
    expect(a.entry).toBe('/assets/index-CJS8zk9A.js')
    expect(a.assets).toContain('/assets/vendor-LyKwLCv-.js')
    expect(a.assets).toContain('/assets/index-DkEWv1cU.css')
    expect(a.assets).not.toContain('/favicon.ico')
  })

  it('reads VITE_APP_VERSION from the entry bundle', () => {
    expect(parseBundleVersion(ENTRY)).toBe('v2.76.3')
    expect(parseBundleVersion('var x={BASE_URL:`/`,DEV:!1}')).toBeNull()
  })

  function siteFetcher(missing: string[] = []): Fetcher & { urls: string[] } {
    const urls: string[] = []
    const f = (async (url: string) => {
      urls.push(url)
      const path = new URL(url).pathname
      if (path === '/')
        return new Response(HTML, { headers: { 'content-type': 'text/html' } })
      if (missing.includes(path))
        // Firebase answers a missing /assets/* with a 404 HTML page.
        return new Response('<html>', {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      const type = path.endsWith('.css') ? 'text/css' : 'text/javascript'
      return new Response(path === '/assets/index-CJS8zk9A.js' ? ENTRY : '', {
        headers: { 'content-type': type },
      })
    }) as Fetcher & { urls: string[] }
    f.urls = urls
    return f
  }

  it('reports the live version with every asset probe ok', async () => {
    const r = await liveVersion({
      base: 'https://ts.taverns.red',
      fetcher: siteFetcher(),
    })
    expect(r).toMatchObject({
      version: 'v2.76.3',
      entry: '/assets/index-CJS8zk9A.js',
      broken: [],
    })
    expect(r.assets.length).toBeGreaterThan(5)
  })

  it('lists a 404 asset as broken', async () => {
    const r = await liveVersion({
      base: 'https://ts.taverns.red',
      fetcher: siteFetcher(['/assets/vendor-LyKwLCv-.js']),
    })
    expect(r.broken.map(b => b.path)).toEqual(['/assets/vendor-LyKwLCv-.js'])
  })
})
