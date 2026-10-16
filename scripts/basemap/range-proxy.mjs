#!/usr/bin/env node
// range-proxy.mjs — a local, resuming HTTP range proxy for `pmtiles extract` (#2084).
//
// Why: go-pmtiles 1.31.2 reads remote archives with a bare
// `http.DefaultClient.Do` (pmtiles/bucket.go, HTTPBucket) and has no retry or
// resume. For world z0-14 the whole 64 GB tile section is ONE range request
// ("fetching 58786221 tiles, 1 chunks, 1 requests", run 38826110491), so a
// single dropped connection restarts the download from zero. Attempt 1 died
// at 42 GB (HTTP/2 INTERNAL_ERROR), attempt 2 at 4 GB (TCP reset).
//
// What: extract reads http://127.0.0.1:<port>/<key> instead. Each range it
// asks for is fetched from the upstream in bounded segments, and a segment
// whose connection drops (or stalls) is re-requested from the last byte
// already delivered. Node's fetch speaks HTTP/1.1. Every upstream response
// must be a 206 starting at the requested byte with the same ETag as the
// first one; anything else ends the response short, so extract fails loudly
// (and the outer retry in build-basemap.sh starts over) rather than splicing
// two builds together.
//
// Usage: node scripts/basemap/range-proxy.mjs <upstream base URL>
// Prints {"url":"http://127.0.0.1:<port>"} on stdout once listening (R4);
// logs go to stderr.
//
// Env (defaults in brackets):
//   RANGE_PROXY_SEGMENT_BYTES  upstream request size            [268435456]
//   RANGE_PROXY_RETRIES        consecutive failures per segment [8]
//   RANGE_PROXY_BACKOFF_MS     first backoff, doubled, cap 60 s [2000]
//   RANGE_PROXY_STALL_MS       abort a read idle this long      [60000]
import * as http from 'node:http'

const base = (process.argv[2] ?? '').replace(/\/+$/, '')
if (!/^https?:\/\//.test(base)) {
  console.error('range-proxy: usage: range-proxy.mjs <upstream base URL>')
  process.exit(2)
}
const num = (name, dflt) => {
  const v = Number(process.env[name] ?? dflt)
  if (!Number.isFinite(v) || v < 0) {
    console.error(`range-proxy: ${name} must be a non-negative number`)
    process.exit(2)
  }
  return v
}
const SEGMENT = Math.max(1, num('RANGE_PROXY_SEGMENT_BYTES', 256 * 1024 * 1024))
const RETRIES = num('RANGE_PROXY_RETRIES', 8)
const BACKOFF_MS = num('RANGE_PROXY_BACKOFF_MS', 2000)
const STALL_MS = num('RANGE_PROXY_STALL_MS', 60000)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = msg => console.error(`range-proxy: ${msg}`)

/** A failure that retrying cannot fix (4xx, wrong shape, object changed). */
class Fatal extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

/**
 * Fetch bytes [pos, end] of `url`, calling `onChunk` for each piece, resuming
 * after a drop. `onFirst` sees the first good response (once per request).
 */
async function streamRange(url, pos, end, ctx, onFirst, onChunk) {
  let failures = 0
  while (pos <= end) {
    const ac = new AbortController()
    ctx.abort = () => ac.abort()
    let timer
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => ac.abort(new Error('stalled')), STALL_MS)
    }
    try {
      arm()
      const res = await fetch(url, {
        headers: { Range: `bytes=${pos}-${end}` },
        signal: ac.signal,
      })
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Fatal(`upstream ${res.status}`, res.status)
      }
      if (res.status !== 206) {
        if (res.status === 200) throw new Fatal('upstream ignored Range (200)')
        throw new Error(`upstream ${res.status}`)
      }
      const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(
        res.headers.get('content-range') ?? ''
      )
      if (!m || Number(m[1]) !== pos) {
        throw new Fatal(`bad content-range ${res.headers.get('content-range')}`)
      }
      const etag = res.headers.get('etag') ?? ''
      if (ctx.etag === undefined) {
        ctx.etag = etag
        onFirst({ total: m[3], etag })
      } else if (etag !== ctx.etag) {
        throw new Fatal(`object changed (etag ${ctx.etag} -> ${etag})`)
      }
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        arm()
        const want = end - pos + 1
        const piece = value.length > want ? value.subarray(0, want) : value
        if (piece.length > 0) {
          failures = 0
          pos += piece.length
          await onChunk(piece)
        }
        if (pos > end) {
          ac.abort()
          break
        }
      }
      if (pos <= end) throw new Error(`short body, resuming at ${pos}`)
    } catch (err) {
      if (ctx.closed) throw new Fatal('client went away')
      if (err instanceof Fatal) throw err
      failures += 1
      if (failures > RETRIES) {
        throw new Fatal(
          `gave up at byte ${pos} after ${RETRIES} retries: ${err.message}`
        )
      }
      const wait = Math.min(60000, BACKOFF_MS * 2 ** (failures - 1))
      log(
        `${err.cause?.code ?? err.message} at byte ${pos}; retry ${failures}/${RETRIES} in ${wait} ms`
      )
      await sleep(wait)
    } finally {
      clearTimeout(timer)
    }
  }
}

const server = http.createServer(async (req, res) => {
  const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '')
  if (req.method !== 'GET' || !m || Number(m[2]) < Number(m[1])) {
    res.writeHead(400).end('range-proxy: GET with one bytes=a-b range only\n')
    return
  }
  const a = Number(m[1])
  const b = Number(m[2])
  const url = base + req.url
  const ctx = { etag: undefined, closed: false, abort: () => {} }
  res.on('close', () => {
    if (!res.writableFinished) {
      ctx.closed = true
      ctx.abort()
    }
  })
  try {
    for (let pos = a; pos <= b; pos += SEGMENT) {
      const end = Math.min(b, pos + SEGMENT - 1)
      await streamRange(
        url,
        pos,
        end,
        ctx,
        ({ total, etag }) => {
          const head = {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(b - a + 1),
            'Content-Range': `bytes ${a}-${b}/${total}`,
          }
          if (etag) head.ETag = etag
          res.writeHead(206, head)
        },
        chunk =>
          res.write(chunk) ? undefined : new Promise(r => res.once('drain', r))
      )
    }
    res.end()
  } catch (err) {
    log(`${req.url} bytes=${a}-${b}: ${err.message}`)
    if (!res.headersSent) {
      res.writeHead(err.status ?? 502).end()
    } else {
      // Mid-body: end short so the client sees a truncated read, never a
      // spliced one.
      res.destroy()
    }
  }
})

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  process.stdout.write(
    JSON.stringify({ url: `http://127.0.0.1:${port}` }) + '\n'
  )
  log(`listening on 127.0.0.1:${port} -> ${base}`)
})
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => process.exit(0))
}
