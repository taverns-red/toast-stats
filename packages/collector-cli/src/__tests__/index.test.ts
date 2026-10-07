/**
 * index.ts — the collector CLI package entry (#1687).
 *
 * Pins `run()` (parse process.argv through the real command tree) and the
 * auto-run guard: importing the module only runs the CLI when it IS the
 * process's main script (argv[1] names index.ts / index.js), and a fatal
 * error exits 2 with the message on stderr (R4). `bin/collector-cli.js`
 * imports `dist/index.js` and calls `run()` itself, so the guard must stay
 * off there or the CLI would parse twice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const parseAsync = vi.fn<(argv: string[]) => Promise<unknown>>()
const createCLI = vi.fn(() => ({ parseAsync }))

vi.mock('../cli.js', () => ({ createCLI }))
vi.mock('../CollectorOrchestrator.js', () => ({
  CollectorOrchestrator: class CollectorOrchestrator {},
}))

describe('collector-cli index.ts', () => {
  const originalArgv = process.argv
  let exit: ReturnType<typeof vi.spyOn>
  let stderr: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    parseAsync.mockReset()
    createCLI.mockClear()
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never)
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.argv = originalArgv
    vi.restoreAllMocks()
  })

  async function importWithArgv(argv: string[]) {
    process.argv = argv
    return import('../index.js')
  }

  it('run() builds the CLI and parses the current process.argv', async () => {
    const mod = await importWithArgv([
      '/usr/bin/node',
      '/repo/node_modules/.bin/vitest',
    ])
    parseAsync.mockResolvedValue(undefined)
    process.argv = ['/usr/bin/node', '/x/cli', 'scrape', '--date', '2026-07-01']

    await mod.run()

    expect(createCLI).toHaveBeenCalledTimes(1)
    expect(parseAsync).toHaveBeenCalledWith([
      '/usr/bin/node',
      '/x/cli',
      'scrape',
      '--date',
      '2026-07-01',
    ])
  })

  it('run() propagates a parse failure to the caller', async () => {
    const mod = await importWithArgv([
      '/usr/bin/node',
      '/x/bin/collector-cli.js',
    ])
    parseAsync.mockRejectedValue(new Error('unknown command'))

    await expect(mod.run()).rejects.toThrow('unknown command')
  })

  it('does not auto-run when imported by the bin wrapper (argv[1] is not index.*)', async () => {
    await importWithArgv([
      '/usr/bin/node',
      '/opt/collector-cli/bin/collector-cli.js',
    ])

    expect(createCLI).not.toHaveBeenCalled()
    expect(parseAsync).not.toHaveBeenCalled()
  })

  it.each([
    ['tsx src/index.ts', '/repo/packages/collector-cli/src/index.ts'],
    ['node dist/index.js', '/repo/packages/collector-cli/dist/index.js'],
  ])('auto-runs when executed directly (%s)', async (_label, script) => {
    parseAsync.mockResolvedValue(undefined)

    await importWithArgv(['/usr/bin/node', script, 'status'])

    await vi.waitFor(() =>
      expect(parseAsync).toHaveBeenCalledWith([
        '/usr/bin/node',
        script,
        'status',
      ])
    )
    expect(exit).not.toHaveBeenCalled()
  })

  it('exits 2 with the error message on stderr when the auto-run fails', async () => {
    parseAsync.mockRejectedValue(new Error('GCS unreachable'))

    await importWithArgv(['/usr/bin/node', '/repo/dist/index.js', 'upload'])

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(2))
    expect(stderr).toHaveBeenCalledWith('Fatal error:', 'GCS unreachable')
  })

  it('re-exports createCLI and CollectorOrchestrator for programmatic use', async () => {
    const mod = await importWithArgv([
      '/usr/bin/node',
      '/x/bin/collector-cli.js',
    ])

    expect(mod.createCLI).toBe(createCLI)
    expect(typeof mod.CollectorOrchestrator).toBe('function')
  })
})
