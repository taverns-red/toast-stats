/**
 * transformServiceFactory — the single blessed production constructor for
 * TransformService (#1160, follow-up to the #1129 fail-closed chain).
 *
 * `TransformService`'s `closingDateRegistry` is optional on the config type so
 * test fixtures can opt into legacy fail-open behavior. Direct production
 * construction must always inject a REAL, loaded registry — not just a present
 * key (a `closingDateRegistry: undefined` would type-check while silently
 * reverting to fail-open). This factory owns the registry load, so a caller
 * cannot forget it or pass undefined: it is the ergonomic, correct path.
 *
 * The companion guard test (transformServiceRegistryGuard) is the backstop
 * that catches any future site bypassing this factory with a bare
 * `new TransformService(...)` that omits the registry.
 */

import type { Logger } from '@toastmasters/analytics-core'
import {
  ClosingDateRegistry,
  type ClosingDateEntry,
} from '../utils/ClosingDateRegistry.js'
import { TransformService } from './TransformService.js'

/**
 * Load closing-date registry months for the fail-closed closing remap
 * (#1129). Resolves docs/month-end-closing-dates.json relative to cwd — the
 * repo root in CI and local runs. A missing or empty registry yields [], so
 * every metadata-less, footer-less date fails closed (refused) rather than
 * being published under its raw date.
 */
export async function loadClosingDateRegistryMonths(): Promise<
  ClosingDateEntry[]
> {
  const registry = new ClosingDateRegistry({ projectRoot: process.cwd() })
  const file = await registry.read()
  if (file.months.length === 0) {
    console.error(
      '[WARN] Closing-date registry is empty or missing ' +
        '(docs/month-end-closing-dates.json) — dates undecidable from ' +
        'metadata/CSV footer will FAIL CLOSED (#1129)'
    )
  }
  return file.months
}

/**
 * Construct a production `TransformService` with the closing-date registry
 * loaded and injected. Use this — never a bare `new TransformService(...)` —
 * at every production entry point, so the fail-closed chain can never be
 * silently disabled by a forgotten registry.
 */
export async function createProductionTransformService(config: {
  cacheDir: string
  logger?: Logger
}): Promise<TransformService> {
  return new TransformService({
    cacheDir: config.cacheDir,
    logger: config.logger,
    closingDateRegistry: await loadClosingDateRegistryMonths(),
  })
}
