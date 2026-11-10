/** Remote Streamable HTTP transport for the MCP server (spike #2605). */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Server } from 'node:http'
import type { CdnClient } from './cdn/CdnClient.js'

export interface HttpOptions {
  client: CdnClient
  /** Max requests per client IP per minute. */
  rateLimitPerMinute?: number
}

export function createHttpHandler(
  _opts: HttpOptions
): (req: IncomingMessage, res: ServerResponse) => void {
  throw new Error('not implemented')
}

export function startHttpServer(
  _opts: HttpOptions & { port: number }
): Promise<Server> {
  throw new Error('not implemented')
}
