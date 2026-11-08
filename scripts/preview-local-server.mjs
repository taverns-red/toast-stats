#!/usr/bin/env node
/**
 * preview-local-server.mjs — put Firebase Hosting's compression in front of
 * the Hosting emulator, so a local build is served the way its PR preview
 * channel would serve it (#2544).
 *
 * PR Preview's Playwright smoke shards load the build from inside the runner
 * instead of the deployed `pr-<N>` channel: in October 2026 the channel
 * loads were 275 of the 282 GiB Hosting served. (Lighthouse and the one
 * wire-cost smoke stay on the channel: this server is HTTP/1.1, Hosting is
 * h2/h3.) The Hosting emulator
 * (`firebase emulators:start --only hosting:staging`, started by
 * scripts/serve-preview-locally.sh) applies firebase.json itself: headers,
 * rewrites, clean URLs. Two things differ, and this proxy evens them out:
 *
 *   1. Compression. The emulator's brotli is quality ~4; Hosting serves
 *      brotli quality 11 (an index chunk from ts.taverns.red is 44,748 bytes;
 *      quality 11 gives 44,746, quality 4 gives 52,724), so the emulator
 *      alone would add ~18% to every script byte the smokes load. For a client that accepts br, the proxy
 *      asks the emulator for the raw bytes and re-encodes compressible 200s
 *      at quality 11. Anything else (ranges, images, errors, a client with
 *      no br) passes through as the emulator sent it.
 *   2. `upgrade-insecure-requests`. The local origin is http://127.0.0.1.
 *      Chromium treats loopback as trustworthy and upgrades nothing; WebKit
 *      upgrades every same-origin request to https://127.0.0.1, where nothing
 *      listens, and no page loads. The proxy drops that one directive and
 *      keeps the rest of the CSP. On the https channel the directive has
 *      nothing to upgrade, and the real-preview smoke still runs under the
 *      full header.
 *
 * Env:
 *   PORT      Listen port. Default 4173.
 *   UPSTREAM  The Hosting emulator. Default http://127.0.0.1:5050
 *             (firebase.json `emulators.hosting`).
 * Logs "ready" once listening.
 */
import { createHash } from 'node:crypto'
import { createServer, request } from 'node:http'
import { brotliCompress, constants } from 'node:zlib'
import { promisify } from 'node:util'

const PORT = Number(process.env.PORT || 4173)
const UPSTREAM = new URL(process.env.UPSTREAM || 'http://127.0.0.1:5050')
const brotli = promisify(brotliCompress)

/** Types Hosting compresses: text, scripts, JSON, XML and SVG. */
const COMPRESSIBLE =
  /^(text\/|application\/(javascript|json|manifest\+json|xml|wasm)|image\/svg\+xml|[^;]*\+(json|xml)\b)/i

/**
 * Quality-11 output by content hash. Not by ETag: the emulator keeps
 * index.html's ETag across rebuilds, so a rebuild would serve stale bytes.
 */
const cache = new Map()

const acceptsBr = header => /\bbr\b/.test(String(header ?? ''))

function withoutUpgrade(csp) {
  return csp
    .split(';')
    .map(d => d.trim())
    .filter(d => d && d.toLowerCase() !== 'upgrade-insecure-requests')
    .join('; ')
}

function responseHeaders(upstreamRes) {
  const headers = { ...upstreamRes.headers }
  const csp = headers['content-security-policy']
  if (typeof csp === 'string') {
    headers['content-security-policy'] = withoutUpgrade(csp)
  }
  return headers
}

const server = createServer((req, res) => {
  const br = req.method === 'GET' && acceptsBr(req.headers['accept-encoding'])
  const headers = { ...req.headers, host: UPSTREAM.host }
  if (br) headers['accept-encoding'] = 'identity'

  const up = request(
    {
      host: UPSTREAM.hostname,
      port: UPSTREAM.port,
      method: req.method,
      path: req.url,
      headers,
    },
    upRes => {
      const out = responseHeaders(upRes)
      const type = String(upRes.headers['content-type'] ?? '')
      const recompress =
        br &&
        upRes.statusCode === 200 &&
        !upRes.headers['content-encoding'] &&
        !upRes.headers['content-range'] &&
        COMPRESSIBLE.test(type)
      if (!recompress) {
        res.writeHead(upRes.statusCode ?? 502, out)
        upRes.pipe(res)
        return
      }
      const chunks = []
      upRes.on('data', c => chunks.push(c))
      upRes.on('end', async () => {
        try {
          const raw = Buffer.concat(chunks)
          const key = createHash('sha256').update(raw).digest('hex')
          let body = cache.get(key)
          if (!body) {
            body = await brotli(raw, {
              params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
            })
            cache.set(key, body)
          }
          out['content-encoding'] = 'br'
          out['content-length'] = String(body.length)
          out['vary'] = 'Accept-Encoding'
          delete out['transfer-encoding']
          res.writeHead(200, out)
          res.end(body)
        } catch (err) {
          console.error(`compress ${req.url}: ${err}`)
          res.writeHead(500)
          res.end()
        }
      })
    }
  )
  up.on('error', err => {
    console.error(`upstream ${req.url}: ${err.message}`)
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(up)
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(
    `preview-local-server ready on http://127.0.0.1:${PORT} -> ${UPSTREAM.origin}`
  )
})
