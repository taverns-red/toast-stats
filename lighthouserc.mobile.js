/**
 * Lighthouse CI — MOBILE gate on the PR preview channel (#1830, epic #1827).
 *
 * Why a second config: `lighthouserc.js` runs the DESKTOP preset on `/` only,
 * against localhost fixtures (deterministic, pre-deploy). It never sees a phone
 * on a phone network, and the mobile review (2026-10-11) found the gaps there.
 * At 375 px, throttled, the club page's LCP was 10.5 s, and every route paid
 * ~1.1 MB of fixed wire cost.
 *
 * This config runs Lighthouse's default MOBILE profile (simulated throttling:
 * 150 ms RTT, 1.6 Mbps, 4x CPU — the same profile as the review's perf.mjs)
 * against the DEPLOYED preview. That means real CSP from firebase.json, real
 * staging CDN data, and real fonts, on the five routes the issue names.
 * pr-preview.yml sets LHCI_BASE_URL to the preview channel URL.
 *
 * Levels: everything was `warn` for the first green week and is now `error`
 * (2026-10-19, recorded on #1830). Over 23 preview runs that day every route
 * passed every budget, best-of-3; the least headroom was club LCP (worst
 * 3480 ms vs 3800 ms), then regions LCP (3229 vs 3600) and clubs LCP (4319 vs
 * 4800).
 *
 * Budgets are FINAL (2026-10-21, #1856: "Re-baseline and close"). Where a
 * route is looser than its TARGET, the budget is the measured value plus
 * ~10% and no issue tracks the gap any more. They are BUDGETS, not targets:
 * lower one whenever a change earns it. Never raise one to make a run pass.
 *
 * The desktop gate in lighthouserc.js is unchanged and still errors.
 */

const BASE = (process.env.LHCI_BASE_URL || 'http://localhost:4173').replace(
  /\/+$/,
  ''
)

/** The five routes from #1830. Club 7238597 (90 Elgin) is a stable D61 club. */
const ROUTES = {
  landing: '/',
  district: '/district/61',
  clubs: '/district/61/clubs',
  club: '/district/61/club/7238597',
  regions: '/regions',
}

/** Targets from #1830 / review §7. */
const TARGET = {
  hubLcpMs: 2500,
  clubLcpMs: 3000,
  cls: 0.1,
  scriptBytes: 300 * 1024,
  totalBytes: 500 * 1024,
}

/**
 * Per-route budgets. FINAL since 2026-10-21 (#1856). Where a value is looser
 * than TARGET, it is the measured value plus ~10% headroom. Lower one when a
 * change earns it. NEVER raise one to make a run pass.
 *
 * Calibration (2026-10-11, preview with #1850 + #1853 applied): LCP budgets
 * come from the GitHub ubuntu runner itself (PR #1858's first run), not a
 * laptop. Lantern's simulated LCP scales with the host's observed CPU, and the
 * runner read ~1.4-1.7x a local run (`/` 4.7 s vs 3.2 s). LHCI asserts the
 * best of the 3 runs, so each LCP budget is the runner's best + ~15%.
 * Byte and CLS budgets are host-independent and match local runs.
 *
 * Ratchets 1 and 2 (2026-10-13, PR #1991 and PR #2015) lowered CLS and script
 * to TARGET on every route, using the same method as the final re-baseline.
 *
 * Final re-baseline (2026-10-21, #1856): 13 PR-preview runs x 3 samples on
 * the runner (2026-10-20/21, runs 39449865664 to 39596651127). Each LCP and
 * total-bytes budget is the worst per-run best + ~10%, or its TARGET where
 * that already passes. The bimodal LCP on /district/* is gone (#1995), and
 * #1852 (gzip CDN JSON) more than halved the /district/* and club totals.
 * Comments show "median of 39 samples / worst per-run best". Club LCP keeps
 * 3800 ms: worst-best + 10% would be 3850, and a budget is never raised.
 * Still above TARGET, accepted as final: every LCP, and total bytes on
 * /district/61, /district/61/clubs and the club page.
 */
const KB = 1024
const BUDGETS = {
  // LCP 3200 / 3273 ms (2.3 / 3.2 s within a run); CLS 0;
  // script 175 / 180 KB; total 321 / 327 KB
  landing: {
    lcpMs: 3600,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 500 * KB,
  },
  // LCP 3945 / 4021 ms (was bimodal 3.0 / 6.0 s); CLS 0.014;
  // script 240 / 243 KB; total 479 / 481 KB (was 1101 / 1104)
  district: {
    lcpMs: 4450,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 530 * KB,
  },
  // LCP 4232 / 4310 ms; CLS 0; script 248 / 252 KB;
  // total 557 / 560 KB (was 1180 / 1180)
  clubs: {
    lcpMs: 4750,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 620 * KB,
  },
  // LCP 3475 / 3501 ms; CLS 0; script 236 / 240 KB; total 579 / 584 KB
  // (was 1188 / 1197; prod before #1830, Lighthouse mobile: 15.1 s, 2.36 MB).
  // #1852 option C (PR #2147) set the data-gated hero's floor on this gate:
  // Lantern charges the CDN connection (~600 ms) to any h1 that waits on
  // data, so 3000 ms needs a new artifact.
  club: {
    lcpMs: 3800,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 640 * KB,
  },
  // LCP 3175 / 3193 ms; CLS 0; script 194 / 196 KB; total 315 / 317 KB
  regions: {
    lcpMs: 3500,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 500 * KB,
  },
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function routeAssertions(key) {
  const b = BUDGETS[key]
  return {
    // Anchor on the path so `/district/61` does not also match its subpages.
    matchingUrlPattern: `^${escapeRe(BASE + ROUTES[key])}/?$`,
    assertions: {
      'largest-contentful-paint': ['error', { maxNumericValue: b.lcpMs }],
      'cumulative-layout-shift': ['error', { maxNumericValue: b.cls }],
      'resource-summary:script:size': [
        'error',
        { maxNumericValue: b.scriptBytes },
      ],
      'resource-summary:total:size': [
        'error',
        { maxNumericValue: b.totalBytes },
      ],
    },
  }
}

module.exports = {
  ROUTES,
  TARGET,
  BUDGETS,
  ci: {
    collect: {
      url: Object.values(ROUTES).map(p => BASE + p),
      numberOfRuns: 3,
      settings: {
        // No `preset`: Lighthouse's default IS the mobile profile. Pinned
        // explicitly so a future default change can't silently move the gate.
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        throttlingMethod: 'simulate',
        throttling: {
          rttMs: 150,
          throughputKbps: 1638.4,
          cpuSlowdownMultiplier: 4,
          requestLatencyMs: 562.5,
          downloadThroughputKbps: 1474.56,
          uploadThroughputKbps: 675,
        },
        onlyCategories: ['performance'],
      },
    },
    assert: {
      assertMatrix: Object.keys(ROUTES).map(routeAssertions),
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
}
