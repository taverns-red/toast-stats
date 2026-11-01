/**
 * `agent-cli live-version [--preview <pr>]` (#2418): which build a site is
 * serving, plus a probe of every asset its index.html references.
 *
 * The version is the `VITE_APP_VERSION` that deploy.yml bakes into the
 * entry bundle (the Vite env object, e.g. ``VITE_APP_VERSION:`v2.76.3` ``).
 * Preview builds don't set it, so a preview reports `version: null` and is
 * identified by its entry-bundle hash instead. Firebase answers a missing
 * `/assets/*` with a 404 HTML page (firebase.json rewrite), so an asset is
 * broken when it isn't a 200 or comes back as HTML. Read-only GETs/HEADs.
 */
import { retryAsync } from '../retry.js'

export const LIVE_URL = 'https://ts.taverns.red'

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export function parseEntryAssets(html: string): {
  entry: string | null
  assets: string[]
} {
  const entry =
    html.match(
      /<script[^>]*type="module"[^>]*src="(\/assets\/[^"]+\.js)"/
    )?.[1] ?? null
  const assets = new Set<string>()
  if (entry) assets.add(entry)
  const ref = /<(?:script|link)\b[^>]*\b(?:src|href)="(\/assets\/[^"]+)"/g
  for (const m of html.matchAll(ref)) assets.add(m[1])
  return { entry, assets: [...assets] }
}

export function parseBundleVersion(js: string): string | null {
  return js.match(/VITE_APP_VERSION:\s*[`"']([^`"']+)[`"']/)?.[1] ?? null
}

export interface AssetProbe {
  path: string
  status: number
  contentType: string
  ok: boolean
}

export interface LiveVersionReport {
  base: string
  version: string | null
  entry: string | null
  assets: AssetProbe[]
  broken: AssetProbe[]
  repoVersion?: string | null
}

export interface LiveVersionOptions {
  base: string
  fetcher?: Fetcher
  repoVersion?: string | null
  sleep?: (ms: number) => Promise<void>
}

async function get(
  f: Fetcher,
  url: string,
  sleep?: (ms: number) => Promise<void>,
  method = 'GET'
): Promise<Response> {
  return retryAsync(
    async () => {
      const r = await f(url, {
        method,
        redirect: 'follow',
        headers: { 'cache-control': 'no-cache' },
      })
      if (r.status >= 500) throw new Error(`${method} ${url}: HTTP ${r.status}`)
      return r
    },
    { attempts: 3, baseDelayMs: 1000, sleep }
  )
}

export async function liveVersion(
  opts: LiveVersionOptions
): Promise<LiveVersionReport> {
  const f = opts.fetcher ?? (fetch as Fetcher)
  const base = opts.base.replace(/\/+$/, '')
  const index = await get(f, `${base}/`, opts.sleep)
  if (!index.ok) throw new Error(`GET ${base}/: HTTP ${index.status}`)
  const { entry, assets } = parseEntryAssets(await index.text())
  if (!entry) throw new Error(`no module entry script in ${base}/`)
  const probes: AssetProbe[] = []
  let version: string | null = null
  for (const path of assets) {
    const isEntry = path === entry
    const r = await get(
      f,
      `${base}${path}`,
      opts.sleep,
      isEntry ? 'GET' : 'HEAD'
    )
    const contentType = r.headers.get('content-type') ?? ''
    if (isEntry && r.ok) version = parseBundleVersion(await r.text())
    probes.push({
      path,
      status: r.status,
      contentType,
      ok: r.status === 200 && !/text\/html/i.test(contentType),
    })
  }
  const report: LiveVersionReport = {
    base,
    version,
    entry,
    assets: probes,
    broken: probes.filter(p => !p.ok),
  }
  if (opts.repoVersion !== undefined) report.repoVersion = opts.repoVersion
  return report
}

export function formatLiveVersion(r: LiveVersionReport): string {
  const out = [
    `${r.base}: ${r.version ?? '(no VITE_APP_VERSION baked in — preview/dev build)'} entry ${r.entry}`,
  ]
  if (r.repoVersion !== undefined)
    out.push(`checkout package.json: v${r.repoVersion}`)
  out.push(
    r.broken.length
      ? `assets: ${r.broken.length} of ${r.assets.length} BROKEN`
      : `assets: all ${r.assets.length} ok`
  )
  for (const b of r.broken)
    out.push(`  ✗ ${b.path} HTTP ${b.status} ${b.contentType}`)
  return out.join('\n')
}
