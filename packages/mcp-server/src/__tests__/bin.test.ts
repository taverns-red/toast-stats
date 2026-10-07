/**
 * bin.ts — the MCP server's executable entry (ADR-008; behavioural tests #1687).
 *
 * `stdio-boot.smoke.test.ts` spawns the built binary in a child process, which
 * in-process V8 coverage cannot see. This test imports the entry in-process
 * with the server stubbed, and pins its two behaviours: it starts the stdio
 * server on import, and a failed start is reported on stderr (R4 — stdout is
 * the JSON-RPC stream) and exits 1.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const startStdioServer = vi.fn<() => Promise<void>>()

vi.mock('../server.js', () => ({ startStdioServer }))

describe('bin.ts (MCP stdio entry)', () => {
  let exit: ReturnType<typeof vi.spyOn>
  let stderr: ReturnType<typeof vi.spyOn>
  let stdout: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    startStdioServer.mockReset()
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts the stdio server on import and does not exit on success', async () => {
    startStdioServer.mockResolvedValue(undefined)

    await import('../bin.js')
    await vi.waitFor(() => expect(startStdioServer).toHaveBeenCalledTimes(1))

    // Let the resolved promise settle; no failure path may run.
    await Promise.resolve()
    expect(exit).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
  })

  it('reports a failed start on stderr only and exits with code 1', async () => {
    const err = new Error('transport refused')
    startStdioServer.mockRejectedValue(err)

    await import('../bin.js')

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
    expect(stderr).toHaveBeenCalledWith(
      '[toast-stats-mcp] failed to start:',
      err
    )
    expect(stdout).not.toHaveBeenCalled()
  })
})
