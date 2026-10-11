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
 * Per-route budgets. Where a value is looser than TARGET, it is the measured
 * Lighthouse-mobile median (3 runs, 2026-10-11, the #1853 preview with #1850
 * and #1853 applied) plus about 15% headroom, and RATCHET_ISSUE tracks
 * bringing it down. Lower these as the levers there land (#1852 gzip CDN JSON,
 * #1837 subnav CLS). NEVER raise one to make a run pass.
 */
const RATCHET_ISSUE = '#1856'
const KB = 1024
const BUDGETS = {
  // measured 3240 ms / 0 / 149 KB / 408 KB
  landing: {
    lcpMs: 3800,
    cls: 0.1,
    scriptBytes: 300 * KB,
    totalBytes: 500 * KB,
  },
  // measured 4749 ms / 0 / 308 KB / 1206 KB
  district: {
    lcpMs: 5500,
    cls: 0.1,
    scriptBytes: 350 * KB,
    totalBytes: 1350 * KB,
  },
  // measured 4843 ms / 0.172 / 306 KB / 1279 KB
  clubs: {
    lcpMs: 5500,
    cls: 0.2,
    scriptBytes: 350 * KB,
    totalBytes: 1400 * KB,
  },
  // measured 8008 ms / 0 / 189 KB / 1186 KB (prod before #1830: 15.1 s, 2.36 MB)
  club: { lcpMs: 9000, cls: 0.1, scriptBytes: 300 * KB, totalBytes: 1300 * KB },
  // measured 4363 ms / 0.04 / 164 KB / 310 KB
  regions: {
    lcpMs: 5000,
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
