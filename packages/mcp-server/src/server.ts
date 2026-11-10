/**
 * MCP server bootstrap (ADR-008 Sprint 2).
 *
 * Builds an `McpServer` over the official SDK, registers the read-only
 * {@link TOOLS} backed by a {@link CdnClient}, and (for the installed binary)
 * serves them over stdio. The server is thin: it owns no state beyond the
 * client and performs no computation.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { CdnClient, DEFAULT_CDN_BASE_URL } from './cdn/CdnClient.js'
import { z } from 'zod'
import { TOOLS } from './tools/tools.js'
import { buildDistrictCard } from './tools/districtCard.js'
import {
  CARD_RESOURCE_URI,
  MCP_APP_MIME,
  renderCardHtml,
} from './ui/districtCard.js'

export const SERVER_NAME = 'toast-stats'
export const SERVER_VERSION = '0.1.0'

/**
 * Resolve the CDN origin the installed server reads from. Honors a `CDN_BASE_URL`
 * environment override (self-hosting, a staging CDN, or the offline smoke check
 * pointing at a localhost fixture server); falls back to the public
 * {@link DEFAULT_CDN_BASE_URL} when unset or blank. A whitespace-only value is
 * treated as unset so a stray export can't silently break the default.
 */
export function resolveCdnBaseUrl(
  env: { CDN_BASE_URL?: string } = process.env
): string {
  const override = env.CDN_BASE_URL?.trim()
  return override ? override : DEFAULT_CDN_BASE_URL
}

/** Register every read-only tool on `server`, backed by `client`. */
export function registerTools(server: McpServer, client: CdnClient): void {
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
        // Every tool is a pure CDN read — advertise it so clients can trust it.
        annotations: { readOnlyHint: true },
      },
      // The handler's text envelope IS a valid CallToolResult at runtime; the
      // assertion bridges our minimal ToolTextResult to the SDK's wider type.
      async args =>
        (await t.handler(
          client,
          args as Record<string, unknown>
        )) as CallToolResult
    )
  }
}

/**
 * Register the interactive District snapshot card (MCP Apps, spike #2605): a
 * read-only tool whose `_meta.ui.resourceUri` points at a `ui://` HTML view the
 * host renders in a sandboxed iframe, plus the resource that serves the view.
 */
export function registerDistrictCardApp(
  server: McpServer,
  client: CdnClient
): void {
  server.registerTool(
    'show-district-card',
    {
      title: 'Show a district snapshot card',
      description:
        'Show an interactive card for a district: membership, payments, clubs and Distinguished clubs (confirmed, with provisional shown separately). Omit date for the latest snapshot.',
      inputSchema: {
        districtId: z.string().min(1).describe('District id, e.g. "61"'),
        date: z
          .string()
          .optional()
          .describe('Snapshot date YYYY-MM-DD; omit for latest'),
      },
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: CARD_RESOURCE_URI } },
    },
    async ({ districtId, date }): Promise<CallToolResult> => {
      const r = await buildDistrictCard(client, districtId, date)
      if (!r.available) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(r, null, 2),
            },
          ],
        }
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(r.card, null, 2) }],
        structuredContent: { ...r.card },
      }
    }
  )
  server.registerResource(
    'district-card-view',
    CARD_RESOURCE_URI,
    { mimeType: MCP_APP_MIME },
    async () => ({
      contents: [
        {
          uri: CARD_RESOURCE_URI,
          mimeType: MCP_APP_MIME,
          text: renderCardHtml(),
        },
      ],
    })
  )
}

/** Build a fully-wired MCP server. Inject a `client` in tests. */
export function createServer(client: CdnClient = new CdnClient()): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  })
  registerTools(server, client)
  registerDistrictCardApp(server, client)
  return server
}

/** Start the server over stdio (the local/self-installed transport). */
export async function startStdioServer(): Promise<void> {
  const server = createServer(new CdnClient({ baseUrl: resolveCdnBaseUrl() }))
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
