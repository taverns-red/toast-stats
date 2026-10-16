#!/usr/bin/env node
/**
 * cdn-cors-proxy.mjs — a local CORS proxy in front of the prod CDN (#2106).
 *
 * Why this exists
 * ---------------
 * `cdn.taverns.red` sends no `Access-Control-Allow-Origin` for a `localhost`
 * origin, so a local build pointed at it renders "Failed to fetch". Verifying
 * a local build against real prod data needs a proxy that adds CORS headers.
 *
 * COST WARNING: on 2026-10-13 a hand-rolled ~20-line proxy (`fetch(cdn +
 * req.url)` then `arrayBuffer()`) dropped the `Range` header, so every PMTiles
 * read became a full GET of the basemap archive: 28 GiB of egress for four
 * page loads (.routine-tmp/cdn-66gib-2026-10-13.md). The prod archive is now
 * 64 GiB. Use this script; do not write another proxy.
 *
 * What it does
 * ------------
 * - Forwards the method and the `Range`, `If-*`, `Accept`, `Accept-Encoding`
 *   request headers. Nothing else (no cookies, no Host).
 * - Streams the upstream body with `pipe` — never buffers, never decodes. The
 *   status (206, 304, …) and Content-Range / Accept-Ranges / Content-Length /
 *   Content-Encoding / ETag pass straight through.
 * - Adds `Access-Control-Allow-Origin: *`, exposes the range headers, and
 *   answers preflights locally.
 * - REFUSES (416) a `.pmtiles` GET with no Range, or with an open-ended or
 *   over-large range, before contacting upstream. A regression fails loudly
 *   instead of costing money.
 * - Destroys the upstream request when the client goes away.
 *
 * Usage:
 *   node scripts/dev/cdn-cors-proxy.mjs [upstream]   # default https://cdn.taverns.red
 *   VITE_CDN_BASE_URL=http://127.0.0.1:8899 npm run build:frontend
 *
 * Prints {"url":"http://127.0.0.1:<port>"} on stdout once listening; logs go
 * to stderr (R4).
 *
 * Env:
 *   PORT                      Listen port. Default 8899 (0 = any free port).
 *   CDN_UPSTREAM              Upstream base URL if no argument is given.
 *   CDN_PROXY_MAX_RANGE_BYTES Largest .pmtiles range served. Default 64 MiB.
 */
import { createServer } from 'node:http'
import * as http from 'node:http'
import * as https from 'node:https'

const DEFAULT_UPSTREAM = 'https://cdn.taverns.red'

const FORWARD_REQUEST_HEADERS = [
  'range',
  'if-range',
  'if-match',
  'if-none-match',
  'if-modified-since',
  'if-unmodified-since',
  'accept',
  'accept-encoding',
]

// Hop-by-hop headers (RFC 9110 §7.6.1) and upstream CORS headers we replace.
const DROP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'trailer',
  'te',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-allow-headers',
  'access-control-allow-methods',
])

const EXPOSE_HEADERS =
  'Content-Range, Accept-Ranges, Content-Length, Content-Encoding, ETag, Last-Modified'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': EXPOSE_HEADERS,
}

const log = msg => console.error(`cdn-cors-proxy: ${msg}`)

const upstreamArg = process.argv[2] ?? process.env.CDN_UPSTREAM
const upstream = new URL((upstreamArg || DEFAULT_UPSTREAM).replace(/\/+$/, ''))
if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
  log(`upstream must be http(s): ${upstream.href}`)
  process.exit(2)
}
const client = upstream.protocol === 'https:' ? https : http
const basePath = upstream.pathname.replace(/\/+$/, '')

const PORT = Number(process.env.PORT ?? 8899)
const MAX_RANGE_BYTES = Number(
  process.env.CDN_PROXY_MAX_RANGE_BYTES ?? 64 * 1024 * 1024
)
if (!Number.isFinite(PORT) || !Number.isFinite(MAX_RANGE_BYTES)) {
  log('PORT and CDN_PROXY_MAX_RANGE_BYTES must be numbers')
  process.exit(2)
}

/**
 * Why a `.pmtiles` request must be refused, or null when it may go upstream.
 * Only bounded `bytes=a-b` ranges (one or more) within the cap are allowed.
 */
function pmtilesRefusal(range) {
  if (!range) {
    return 'a .pmtiles GET without a Range header would download the whole archive (the prod basemap is tens of GiB)'
  }
  const m = /^bytes=(.+)$/.exec(range.trim())
  if (!m) return `unsupported Range "${range}"`
  for (const part of m[1].split(',')) {
    const r = /^\s*(\d+)-(\d+)\s*$/.exec(part)
    if (!r) {
      return `open-ended or suffix Range "${range}" could read the whole archive; send bytes=a-b`
    }
    const span = Number(r[2]) - Number(r[1]) + 1
    if (span > MAX_RANGE_BYTES) {
      return `Range "${range}" asks for ${span} bytes, over the ${MAX_RANGE_BYTES}-byte cap (CDN_PROXY_MAX_RANGE_BYTES)`
    }
  }
  return null
}

const server = createServer((req, res) => {
  const method = req.method ?? 'GET'
  const path = (req.url ?? '/').split('?')[0]

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      ...CORS,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers':
        req.headers['access-control-request-headers'] ||
        'Range, If-None-Match, If-Modified-Since, If-Range',
      'Access-Control-Max-Age': '600',
    })
    res.end()
    return
  }
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...CORS, Allow: 'GET, HEAD, OPTIONS' })
    res.end('cdn-cors-proxy: only GET, HEAD and OPTIONS are proxied\n')
    return
  }
  if (method === 'GET' && path.endsWith('.pmtiles')) {
    const why = pmtilesRefusal(req.headers.range)
    if (why) {
      log(`REFUSED ${method} ${req.url}: ${why}`)
      res.writeHead(416, { ...CORS, 'Content-Type': 'text/plain' })
      res.end(`cdn-cors-proxy refused ${req.url}: ${why}\n`)
      return
    }
  }

  const headers = {}
  for (const h of FORWARD_REQUEST_HEADERS) {
    if (req.headers[h] !== undefined) headers[h] = req.headers[h]
  }

  const up = client.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || undefined,
      method,
      path: basePath + (req.url ?? '/'),
      headers,
    },
    upRes => {
      const out = { ...CORS }
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (v !== undefined && !DROP_RESPONSE_HEADERS.has(k)) out[k] = v
      }
      res.writeHead(upRes.statusCode ?? 502, out)
      upRes.pipe(res)
      log(
        `${method} ${req.url} ${req.headers.range ?? ''} -> ${upRes.statusCode}`
      )
    }
  )
  up.on('error', err => {
    log(`upstream error for ${req.url}: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(502, { ...CORS, 'Content-Type': 'text/plain' })
      res.end(`cdn-cors-proxy: upstream error: ${err.message}\n`)
    } else {
      res.destroy(err)
    }
  })
  // The client went away before the response finished: stop pulling bytes.
  res.on('close', () => {
    if (!res.writableFinished) up.destroy()
  })
  up.end()
})

server.listen(PORT, '127.0.0.1', () => {
  const { port } = server.address()
  console.log(JSON.stringify({ url: `http://127.0.0.1:${port}` }))
  log(`listening on 127.0.0.1:${port} -> ${upstream.href}`)
})
