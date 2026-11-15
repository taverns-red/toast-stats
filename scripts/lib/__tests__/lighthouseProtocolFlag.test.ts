import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

/**
 * Lighthouse byte budgets measure over ONE fixed protocol (#2849).
 *
 * Firebase Hosting advertises `alt-svc: h3`, and Chrome then serves each
 * request over HTTP/3 or HTTP/2 non-deterministically. Small chunks cost far
 * more over h3 (a 236-byte-brotli chunk transferred as 355 bytes over h2 but
 * 1217 over h3), so `resource-summary:total:size` swung by several KB with the
 * mix and the district budget passed or failed on noise. `--disable-quic`
 * (Chromium `kDisableQuic`, "Disables the QUIC protocol", in
 * components/network_session_configurator/common/network_switch_list.h) stops
 * Chrome using HTTP/3, so every request is h2. LHCI passes
 * `ci.collect.settings.chromeFlags` (a string) to the Lighthouse CLI and
 * appends `--headless=new`, so the flag must live in that setting in every
 * LHCI config, desktop and mobile. No budget or run count depends on this.
 */

const ROOT = join(__dirname, '..', '..', '..')
const require = createRequire(import.meta.url)

// lighthouserc files are CommonJS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (file: string): any => require(join(ROOT, file))

const flagsOf = (rc: {
  ci?: { collect?: { settings?: { chromeFlags?: unknown } } }
}) => {
  const flags = rc.ci?.collect?.settings?.chromeFlags
  return typeof flags === 'string' ? flags.split(/\s+/) : []
}

describe('LHCI configs pin one transfer protocol (#2849)', () => {
  it('lighthouserc.js (desktop) passes --disable-quic', () => {
    expect(flagsOf(load('lighthouserc.js'))).toContain('--disable-quic')
  })

  it('lighthouserc.mobile.js passes --disable-quic', () => {
    expect(flagsOf(load('lighthouserc.mobile.js'))).toContain('--disable-quic')
  })

  it('lighthouserc.mobile.js passes it for a single-route (LHCI_ROUTE) run too', () => {
    const { ciConfig } = load('lighthouserc.mobile.js')
    expect(flagsOf({ ci: ciConfig({ LHCI_ROUTE: 'district' }) })).toContain(
      '--disable-quic'
    )
  })
})
