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
  parseHtmlVersion,
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
      [/^gh pr view 2416 /, ok('{"state":"OPEN"}')],
    ])
    const p = await previewUrl(2416, {
      repo: REPO,
      runner,
      sleep: noSleep,
      now: () => 0,
    })
    expect(p?.url).toContain('pr-2416')
  })

  it('marks the channel removed once the PR is closed or merged', async () => {
    // pr-preview-cleanup.yml deletes the channel on close; the comment stays.
    const runner = fakeRunner([
      [/issues\/2416\/comments/, ok(JSON.stringify(PAGES))],
      [/^gh pr view 2416 .*--json state/, ok('{"state":"MERGED"}')],
    ])
    const p = await previewUrl(2416, {
      repo: REPO,
      runner,
      sleep: noSleep,
      now: () => Date.parse('2026-11-01T00:00:00Z'),
    })
    expect(p).toMatchObject({ prState: 'MERGED', live: false, expired: false })
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

  describe('after #2999 (env object lives in the cdnBase chunk)', () => {
    const HTML2 = fixture('live-index-2.93.0.html')
    const ENTRY2 = fixture('live-entry-excerpt-2.93.0.txt')
    const CHUNK = fixture('live-cdnbase-chunk-2.93.0.txt')

    function fetcher2(chunk: string): Fetcher {
      return (async (url: string) => {
        const path = new URL(url).pathname
        if (path === '/')
          return new Response(HTML2, {
            headers: { 'content-type': 'text/html' },
          })
        const body =
          path === '/assets/index-Dccouyo0.js'
            ? ENTRY2
            : path === '/assets/cdnBase-BTEFPS6P.js'
              ? chunk
              : ''
        return new Response(body, {
          headers: {
            'content-type': path.endsWith('.css')
              ? 'text/css'
              : 'text/javascript',
          },
        })
      }) as Fetcher
    }

    it('finds the version in a modulepreload chunk', async () => {
      const r = await liveVersion({
        base: 'https://ts.taverns.red',
        fetcher: fetcher2(CHUNK),
      })
      expect(r.version).toBe('v2.93.0')
      expect(r.broken).toEqual([])
    })

    it('reports no version when no chunk has the env object', async () => {
      const r = await liveVersion({
        base: 'https://ts.taverns.red',
        fetcher: fetcher2('var x={BASE_URL:`/`,DEV:!1}'),
      })
      expect(r.version).toBeNull()
    })
  })

  describe('request discipline (#3015)', () => {
    const HTML2 = fixture('live-index-2.93.0.html')
    const ENTRY2 = fixture('live-entry-excerpt-2.93.0.txt')
    const CHUNK = fixture('live-cdnbase-chunk-2.93.0.txt')

    it('goes back to HEAD for every script after the one holding the version', async () => {
      const calls: string[] = []
      const f = (async (url: string, init?: RequestInit) => {
        const path = new URL(url).pathname
        calls.push(`${init?.method ?? 'GET'} ${path}`)
        if (path === '/')
          return new Response(HTML2, {
            headers: { 'content-type': 'text/html' },
          })
        const body =
          path === '/assets/index-Dccouyo0.js'
            ? ENTRY2
            : path === '/assets/cdnBase-BTEFPS6P.js'
              ? CHUNK
              : ''
        return new Response(init?.method === 'HEAD' ? null : body, {
          headers: {
            'content-type': path.endsWith('.css')
              ? 'text/css'
              : 'text/javascript',
          },
        })
      }) as Fetcher
      const r = await liveVersion({
        base: 'https://ts.taverns.red',
        fetcher: f,
      })
      expect(r.version).toBe('v2.93.0')
      const gets = calls.filter(c => c.startsWith('GET ')).map(c => c.slice(4))
      expect(gets).toEqual([
        '/',
        '/assets/index-Dccouyo0.js',
        '/assets/rolldown-runtime-XKyaHtl9.js',
        '/assets/vendor-LyKwLCv-.js',
        '/assets/query-B2l-coOX.js',
        '/assets/meetingHeatmap-Y_Z3357d.js',
        '/assets/esm-n4Spsqby.js',
        '/assets/logger-DZEsNi23.js',
        '/assets/cdnCacheTracker-DmTGIf9q.js',
        '/assets/cdnBase-BTEFPS6P.js',
      ])
      expect(calls).toContain('HEAD /assets/cdn-Bwbz6qMx.js')
      expect(calls).toContain('HEAD /assets/index-Bf2v3-Xq.css')
    })

    it('gives every request an abort signal', async () => {
      const signals: Array<AbortSignal | null | undefined> = []
      const f = (async (url: string, init?: RequestInit) => {
        signals.push(init?.signal)
        const path = new URL(url).pathname
        return new Response(path === '/' ? HTML2 : ENTRY2, {
          headers: {
            'content-type': path === '/' ? 'text/html' : 'text/javascript',
          },
        })
      }) as Fetcher
      await liveVersion({ base: 'https://ts.taverns.red', fetcher: f })
      expect(signals.length).toBeGreaterThan(2)
      for (const s of signals) expect(s).toBeInstanceOf(AbortSignal)
    })

    it('fails a request that hangs past the timeout', async () => {
      const f = ((_url: string, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener('abort', () =>
            rej(new Error('aborted'))
          )
        })) as Fetcher
      await expect(
        liveVersion({
          base: 'https://ts.taverns.red',
          fetcher: f,
          timeoutMs: 5,
          sleep: noSleep,
        })
      ).rejects.toThrow()
    })

    it('cancels the body of a GET that comes back non-ok', async () => {
      let cancelled = false
      const f = (async (url: string) => {
        const path = new URL(url).pathname
        if (path === '/')
          return new Response(HTML2, {
            headers: { 'content-type': 'text/html' },
          })
        const isEntry = path === '/assets/index-Dccouyo0.js'
        const body = new ReadableStream({
          cancel() {
            cancelled = true
          },
        })
        return new Response(isEntry ? body : '', {
          status: isEntry ? 404 : 200,
          headers: { 'content-type': 'text/javascript' },
        })
      }) as Fetcher
      const r = await liveVersion({
        base: 'https://ts.taverns.red',
        fetcher: f,
      })
      expect(r.broken.map(b => b.path)).toContain('/assets/index-Dccouyo0.js')
      expect(cancelled).toBe(true)
    })
  })

  it('still records an asset as broken when cancelling its body rejects (#3015)', async () => {
    // A body that already errored (a timeout after the headers) rejects on
    // cancel(); that must not abort the whole run.
    const f = (async (url: string) => {
      const path = new URL(url).pathname
      if (path === '/')
        return new Response(HTML, { headers: { 'content-type': 'text/html' } })
      if (path === '/assets/index-CJS8zk9A.js') {
        const body = new ReadableStream({
          cancel() {
            return Promise.reject(new Error('stream already errored'))
          },
        })
        return new Response(body, {
          status: 404,
          headers: { 'content-type': 'text/html' },
        })
      }
      return new Response('', {
        headers: {
          'content-type': path.endsWith('.css')
            ? 'text/css'
            : 'text/javascript',
        },
      })
    }) as Fetcher
    const r = await liveVersion({ base: 'https://ts.taverns.red', fetcher: f })
    expect(r.broken.map(b => b.path)).toContain('/assets/index-CJS8zk9A.js')
  })

  describe('after #3000 (the version is a meta tag in index.html)', () => {
    const META = '<meta name="app-version" content="v2.94.0">'
    const HTML3 = fixture('live-index-2.93.0.html').replace(
      '</head>',
      `${META}</head>`
    )

    it('reads the version from the page, whatever the chunks hold', async () => {
      const urls: string[] = []
      const f = (async (url: string) => {
        urls.push(`${url}`)
        const path = new URL(url).pathname
        return new Response(
          path === '/' ? HTML3 : 'var env={mode:`production`}',
          {
            headers: {
              'content-type': path === '/' ? 'text/html' : 'text/javascript',
            },
          }
        )
      }) as Fetcher
      const r = await liveVersion({
        base: 'https://ts.taverns.red',
        fetcher: f,
      })
      expect(r.version).toBe('v2.94.0')
      expect(r.broken).toEqual([])
    })

    it('parses the tag, in either attribute order', () => {
      expect(parseHtmlVersion(HTML3)).toBe('v2.94.0')
      expect(
        parseHtmlVersion('<meta content="v1.2.3" name="app-version" />')
      ).toBe('v1.2.3')
      expect(parseHtmlVersion('<meta name="viewport" content="x">')).toBeNull()
    })
  })

  it('lists a 404 asset as broken', async () => {
    const r = await liveVersion({
      base: 'https://ts.taverns.red',
      fetcher: siteFetcher(['/assets/vendor-LyKwLCv-.js']),
    })
    expect(r.broken.map(b => b.path)).toEqual(['/assets/vendor-LyKwLCv-.js'])
  })
})
