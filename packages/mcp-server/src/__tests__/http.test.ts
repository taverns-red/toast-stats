import { describe, it, expect, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { startHttpServer } from '../http.js'
import { makeClient, makeFixtureFetch } from './_fixture-fetch.js'

const ROUTES = {
  '/v1/latest.json': 'latest.json',
  '/snapshots/2026-06-08/district_61.json': 'district-snapshot.json',
  '/snapshots/2026-06-08/analytics/district_61_analytics.json':
    'district-analytics.json',
}

let server: Server | undefined

async function boot(rateLimitPerMinute?: number): Promise<string> {
  server = await startHttpServer({
    client: makeClient(makeFixtureFetch(ROUTES)),
    port: 0,
    rateLimitPerMinute,
  })
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

afterEach(async () => {
  if (server) await new Promise(r => server!.close(() => r(undefined)))
  server = undefined
})

describe('remote Streamable HTTP transport', () => {
  it('serves tools and the card over /mcp to a real MCP HTTP client', async () => {
    const base = await boot()
    const client = new Client({ name: 'http-test', version: '0.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`))
    )
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('show-district-card')
    const res = await client.callTool({
      name: 'show-district-card',
      arguments: { districtId: '61' },
    })
    expect((res.structuredContent as { membership: number }).membership).toBe(
      2779
    )
    await client.close()
  })

  it('answers /healthz and rejects GET /mcp (stateless, no SSE stream)', async () => {
    const base = await boot()
    expect((await fetch(`${base}/healthz`)).status).toBe(200)
    expect((await fetch(`${base}/mcp`)).status).toBe(405)
    expect((await fetch(`${base}/nope`)).status).toBe(404)
  })

  it('rejects an oversized request body with 413', async () => {
    const base = await boot()
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(200_000) }),
    })
    expect(res.status).toBe(413)
  })

  it('rate limits per client with 429 and Retry-After', async () => {
    const base = await boot(3)
    const statuses: number[] = []
    let retryAfter: string | null = null
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`${base}/healthz`)
      statuses.push(r.status)
      if (r.status === 429) retryAfter = r.headers.get('retry-after')
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200])
    expect(statuses[4]).toBe(429)
    expect(Number(retryAfter)).toBeGreaterThan(0)
  })
})
