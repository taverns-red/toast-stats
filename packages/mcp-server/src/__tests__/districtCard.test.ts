import { describe, it, expect } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../server.js'
import { buildDistrictCard } from '../tools/districtCard.js'
import { CARD_RESOURCE_URI, MCP_APP_MIME } from '../ui/districtCard.js'
import { makeClient, makeFixtureFetch } from './_fixture-fetch.js'

const ROUTES: Record<string, string> = {
  '/v1/latest.json': 'latest.json',
  '/snapshots/2026-06-08/district_61.json': 'district-snapshot.json',
  '/snapshots/2026-06-08/analytics/district_61_analytics.json':
    'district-analytics.json',
}

const NO_ANALYTICS: Record<string, string> = {
  '/v1/latest.json': 'latest.json',
  '/snapshots/2026-06-08/district_61.json': 'district-snapshot.json',
}

async function connected(routes = ROUTES): Promise<Client> {
  const server = createServer(makeClient(makeFixtureFetch(routes)))
  const [ct, st] = InMemoryTransport.createLinkedPair()
  await server.connect(st)
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  await client.connect(ct)
  return client
}

describe('buildDistrictCard', () => {
  it('projects membership, payments, clubs and confirmed + provisional', async () => {
    const r = await buildDistrictCard(
      makeClient(makeFixtureFetch(ROUTES)),
      '61'
    )
    expect(r.available).toBe(true)
    if (!r.available) return
    expect(r.card).toMatchObject({
      districtId: '61',
      snapshotDate: '2026-06-08',
      totalClubs: 162,
      membership: 2779,
      payments: 5800,
      distinguished: { confirmed: 3, provisional: 2 },
    })
    expect(r.card.sources).toHaveLength(2)
  })

  it('reports distinguished as null (never guessed) when analytics is missing', async () => {
    const r = await buildDistrictCard(
      makeClient(makeFixtureFetch(NO_ANALYTICS)),
      '61'
    )
    expect(r.available).toBe(true)
    if (r.available) expect(r.card.distinguished).toBeNull()
  })

  it('returns not-available for an unknown district', async () => {
    const r = await buildDistrictCard(
      makeClient(makeFixtureFetch(ROUTES)),
      '99'
    )
    expect(r.available).toBe(false)
  })
})

describe('MCP Apps wiring', () => {
  it('advertises the card tool with _meta.ui.resourceUri', async () => {
    const client = await connected()
    const { tools } = await client.listTools()
    const tool = tools.find(t => t.name === 'show-district-card')
    expect(tool).toBeDefined()
    expect(tool!.annotations?.readOnlyHint).toBe(true)
    const ui = (tool!._meta as { ui?: { resourceUri?: string } }).ui
    expect(ui?.resourceUri).toBe(CARD_RESOURCE_URI)
    await client.close()
  })

  it('returns structuredContent the view can render', async () => {
    const client = await connected()
    const res = await client.callTool({
      name: 'show-district-card',
      arguments: { districtId: '61' },
    })
    const sc = res.structuredContent as {
      districtId: string
      membership: number
    }
    expect(sc.districtId).toBe('61')
    expect(sc.membership).toBe(2779)
    await client.close()
  })

  it('serves the ui:// resource with the mcp-app MIME type', async () => {
    const client = await connected()
    const { resources } = await client.listResources()
    expect(resources.map(r => r.uri)).toContain(CARD_RESOURCE_URI)
    const read = await client.readResource({ uri: CARD_RESOURCE_URI })
    const c = read.contents[0]!
    expect(c.mimeType).toBe(MCP_APP_MIME)
    const html = (c as { text: string }).text
    expect(html).toContain('ui/initialize')
    expect(html).toContain('ui/notifications/tool-result')
    // The view is self-contained: no external scripts or network calls.
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|https?:\/\//)
    await client.close()
  })
})
