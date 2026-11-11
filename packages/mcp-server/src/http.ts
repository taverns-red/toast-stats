/**
 * Remote Streamable HTTP transport for the MCP server (spike #2605).
 *
 * Stateless and anonymous: every POST /mcp builds a fresh server + transport
 * (no session, no stored state, so Cloud Run can scale to zero and any instance
 * can answer any call). Only public CDN data is reachable; there is no write
 * path. Guards: 64 KiB body cap, per-client fixed-window rate limit, no GET
 * stream (405). Zero extra dependencies: node:http + the SDK's transport.
 */
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { CdnClient } from './cdn/CdnClient.js'
import { createServer } from './server.js'

export const MAX_BODY_BYTES = 64 * 1024
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120
const WINDOW_MS = 60_000

export interface HttpOptions {
  client: CdnClient
  /** Max requests per client per minute (all routes). */
  rateLimitPerMinute?: number
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function rpcError(res: ServerResponse, status: number, message: string): void {
  json(res, status, {
    jsonrpc: '2.0',
    error: { code: -32000, message },
    id: null,
  })
}

/**
 * Identify the caller. Behind Cloud Run the last X-Forwarded-For entry is the
 * one Google's frontend appended; earlier entries are client-controlled.
 */
function clientKey(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff.join(',') : xff
  const last = raw?.split(',').pop()?.trim()
  return last || req.socket.remoteAddress || 'unknown'
}

class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>()
  constructor(private readonly limit: number) {}

  /** Returns 0 if allowed, else the seconds until the window resets. */
  check(key: string, now = Date.now()): number {
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (now - v.start >= WINDOW_MS) this.hits.delete(k)
      }
    }
    const h = this.hits.get(key)
    if (!h || now - h.start >= WINDOW_MS) {
      this.hits.set(key, { start: now, count: 1 })
      return 0
    }
    h.count += 1
    return h.count > this.limit
      ? Math.max(1, Math.ceil((h.start + WINDOW_MS - now) / 1000))
      : 0
  }
}

class BodyTooLarge extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > MAX_BODY_BYTES) throw new BodyTooLarge()
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge()
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createHttpHandler(
  opts: HttpOptions
): (req: IncomingMessage, res: ServerResponse) => void {
  const limiter = new RateLimiter(
    opts.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE
  )

  async function handle(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const retry = limiter.check(clientKey(req))
    if (retry > 0) {
      res.setHeader('retry-after', String(retry))
      return rpcError(res, 429, 'Rate limit exceeded')
    }
    const path = (req.url ?? '').split('?')[0]
    if (path === '/healthz') return json(res, 200, { ok: true })
    if (path !== '/mcp') return json(res, 404, { error: 'not found' })
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      return rpcError(res, 405, 'Method not allowed (stateless server)')
    }
    let body: unknown
    try {
      body = await readJson(req)
    } catch (err) {
      if (err instanceof BodyTooLarge) {
        return rpcError(res, 413, 'Request body too large')
      }
      return rpcError(res, 400, 'Invalid JSON')
    }
    const server = createServer(opts.client)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  return (req, res) => {
    handle(req, res).catch((err: unknown) => {
      console.error('[toast-stats-mcp] request failed:', err)
      if (!res.headersSent) rpcError(res, 500, 'Internal error')
      else res.end()
    })
  }
}

export function startHttpServer(
  opts: HttpOptions & { port: number; host?: string }
): Promise<Server> {
  const server = createHttpServer(createHttpHandler(opts))
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, opts.host ?? '0.0.0.0', () => resolve(server))
  })
}
