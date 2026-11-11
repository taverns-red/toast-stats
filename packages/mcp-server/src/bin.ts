#!/usr/bin/env node
/**
 * Executable entry point for the Toast Stats MCP server (ADR-008).
 *
 * Default: read-only tools over stdio. With `--http` (or MCP_TRANSPORT=http):
 * the same tools over a stateless, anonymous Streamable HTTP endpoint at
 * `/mcp` on $PORT (default 8080) for a remote connector (spike #2605). All
 * diagnostics go to stderr (R4) — stdout carries only the stdio JSON-RPC stream.
 */
import { CdnClient } from './cdn/CdnClient.js'
import { startHttpServer } from './http.js'
import { resolveCdnBaseUrl, startStdioServer } from './server.js'

const http =
  process.argv.includes('--http') || process.env['MCP_TRANSPORT'] === 'http'

const started = http
  ? startHttpServer({
      client: new CdnClient({ baseUrl: resolveCdnBaseUrl() }),
      port: Number(process.env['PORT'] ?? 8080),
    }).then(server => {
      console.error(
        `[toast-stats-mcp] http listening on :${String((server.address() as { port: number }).port)}/mcp`
      )
    })
  : startStdioServer()

started.catch((err: unknown) => {
  console.error('[toast-stats-mcp] failed to start:', err)
  process.exit(1)
})
