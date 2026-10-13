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
 * Levels: everything is `warn` for the first green week, then it is promoted
 * to `error` and the promotion is recorded on #1830. Where a route cannot meet
 * the target yet, its budget is set at the measured value and a ratchet issue
 * (RATCHET_ISSUE) tracks the gap. Those values are BUDGETS, not targets:
 * lower them as soon as the issue lands. Never raise them to make a run pass.
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
 * Per-route budgets. Where a value is looser than TARGET, it is a measured
 * value plus ~15% headroom and RATCHET_ISSUE tracks bringing it down. Lower
 * these as the levers there land (#1852 gzip CDN JSON, #1837 subnav CLS).
 * NEVER raise one to make a run pass.
 *
 * Calibration (2026-10-11, preview with #1850 + #1853 applied): LCP budgets
 * come from the GitHub ubuntu runner itself (PR #1858's first run), not a
 * laptop. Lantern's simulated LCP scales with the host's observed CPU, and the
 * runner read ~1.4-1.7x a local run (`/` 4.7 s vs 3.2 s). LHCI asserts the
 * best of the 3 runs, so each LCP budget is the runner's best + ~15%.
 * `/district/61` is bimodal on the runner (5.7 s / 8.1 s / 8.1 s). Byte and
 * CLS budgets are host-independent and match local runs.
 *
 * Ratchet 1 (2026-10-13, #1856): 8 PR-preview runs x 3 samples on the runner.
 * Each budget is lowered to its TARGET where the worst per-run best passes it
 * with margin; otherwise to that worst per-run best + ~10-15%. Comments show
 * "median of 24 samples / worst per-run best". Still above target: every
 * LCP (#1901 analytics payload gates /district/* and club; landing/regions
 * floor is fonts + shell), and total bytes on /district/*. Clubs script is
 * 323-334 KB (the charts chunk) against the 300 KB target.
 */
const RATCHET_ISSUE = '#1856'
const KB = 1024
const BUDGETS = {
  // LCP 3615 / 3610 ms; CLS 0; script 159 / 165 KB; total 388 / 396 KB
  landing: {
    lcpMs: 4200,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 500 * KB,
  },
  // LCP 3527 / 6015 ms (bimodal: one run's best was 5961); CLS 0.013;
  // script 224 / 226 KB; total 1101 / 1104 KB
  district: {
    lcpMs: 6600,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 1200 * KB,
  },
  // LCP 4069 / 4169 ms (bimodal 3.5 / 8.0 s within a run); CLS 0 (max 0.04,
  // #1837 landed); script 324 / 334 KB; total 1275 / 1286 KB
  clubs: {
    lcpMs: 4800,
    cls: 0.1,
    scriptBytes: 350 * KB,
    totalBytes: 1400 * KB,
  },
  // LCP 6360 / 6613 ms; CLS 0.006; script 211 / 218 KB; total 1188 / 1197 KB
  // (prod before #1830, Lighthouse mobile: 15.1 s, 2.36 MB)
  club: { lcpMs: 7500, cls: 0.1, scriptBytes: 300 * KB, totalBytes: 1300 * KB },
  // LCP 3054 / 3167 ms; CLS 0; script 175 / 179 KB; total 292 / 298 KB
  regions: {
    lcpMs: 3600,
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
      'largest-contentful-paint': ['warn', { maxNumericValue: b.lcpMs }],
      'cumulative-layout-shift': ['warn', { maxNumericValue: b.cls }],
      'resource-summary:script:size': [
        'warn',
        { maxNumericValue: b.scriptBytes },
      ],
      'resource-summary:total:size': [
        'warn',
        { maxNumericValue: b.totalBytes },
      ],
    },
  }
}

module.exports = {
  ROUTES,
  TARGET,
  BUDGETS,
  RATCHET_ISSUE,
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
