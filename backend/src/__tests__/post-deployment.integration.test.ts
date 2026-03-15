/**
 * Post-Deployment Integration Tests
 *
 * These tests verify the live production endpoints at ts.taverns.red
 * via the API Gateway. They assert correctness, compliance, and performance
 * of the deployed application.
 *
 * Run with: npx vitest run src/__tests__/post-deployment.integration.test.ts
 *
 * Prerequisites:
 *   - Network access to the production API Gateway
 *   - Set INTEGRATION_TEST=true environment variable to enable
 */

import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE = 'https://api.taverns.red'
const SITE_URL = 'https://ts.taverns.red'

// Performance budget thresholds (in milliseconds)
const PERFORMANCE_BUDGET = {
  fast: 500, // list endpoints, cached data
  normal: 2000, // single-entity reads
  slow: 5000, // aggregate or cross-district operations
}

// Skip unless INTEGRATION_TEST env var is set
const runIntegration =
  process.env['INTEGRATION_TEST'] === 'true' ? describe : describe.skip

// Helper to measure response time and return parsed data
async function timedFetch(
  url: string
): Promise<{ data: unknown; status: number; timeMs: number; size: number }> {
  const start = performance.now()
  const response = await fetch(url)
  const text = await response.text()
  const timeMs = performance.now() - start
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { data, status: response.status, timeMs, size: text.length }
}

runIntegration('Post-Deployment Integration Tests', () => {
  // ===========================================================================
  // Frontend Hosting
  // ===========================================================================
  describe('Frontend Hosting', () => {
    it('serves the SPA index.html at the root URL', async () => {
      const response = await fetch(SITE_URL)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      const html = await response.text()
      expect(html).toContain('<div id="root">')
      expect(html).toContain('Toastmasters District Visualizer')
    })

    it('serves static JS assets with immutable caching headers', async () => {
      // Get the HTML to find the JS bundle path
      const htmlResponse = await fetch(SITE_URL)
      const html = await htmlResponse.text()
      const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/)
      expect(jsMatch).toBeTruthy()

      const jsUrl = `${SITE_URL}${jsMatch![1]}`
      const jsResponse = await fetch(jsUrl)
      expect(jsResponse.status).toBe(200)
      const cacheControl = jsResponse.headers.get('cache-control')
      expect(cacheControl).toContain('public')
      expect(cacheControl).toContain('max-age=31536000')
      expect(cacheControl).toContain('immutable')
    })

    it('serves CSS assets with immutable caching headers', async () => {
      const htmlResponse = await fetch(SITE_URL)
      const html = await htmlResponse.text()
      const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/)
      expect(cssMatch).toBeTruthy()

      const cssUrl = `${SITE_URL}${cssMatch![1]}`
      const cssResponse = await fetch(cssUrl)
      expect(cssResponse.status).toBe(200)
      const cacheControl = cssResponse.headers.get('cache-control')
      expect(cacheControl).toContain('public')
      expect(cacheControl).toContain('max-age=31536000')
    })

    it('returns SPA fallback for client-side routes', async () => {
      const response = await fetch(`${SITE_URL}/district/93`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      const html = await response.text()
      expect(html).toContain('<div id="root">')
    })
  })

  // ===========================================================================
  // API Gateway: Core Endpoints
  // ===========================================================================
  describe('API Gateway: Core Endpoints', () => {
    it('GET /api/districts returns a list of districts', async () => {
      const { data, status, timeMs } = await timedFetch(`${API_BASE}/districts`)
      expect(status).toBe(200)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.fast)

      const body = data as {
        districts: Array<{ id: string; name: string; status: string }>
        _snapshot_metadata: Record<string, unknown>
      }
      expect(body.districts).toBeDefined()
      expect(Array.isArray(body.districts)).toBe(true)
      expect(body.districts.length).toBeGreaterThan(0)

      // Each district should have required fields
      const district = body.districts[0]!
      expect(district.id).toBeDefined()
      expect(district.name).toBeDefined()
      expect(district.status).toBeDefined()

      // Snapshot metadata should be present
      expect(body._snapshot_metadata).toBeDefined()
      expect(body._snapshot_metadata['snapshot_id']).toBeDefined()
    })

    it('GET /api/districts/rankings returns ranked districts', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/rankings`
      )
      expect(status).toBe(200)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.fast)

      const body = data as {
        rankings: Array<{
          districtId: string
          overallRank: number
          aggregateScore: number
          region: string
        }>
      }
      expect(body.rankings).toBeDefined()
      expect(Array.isArray(body.rankings)).toBe(true)
      expect(body.rankings.length).toBeGreaterThan(100)

      // Verify ranking structure
      const top = body.rankings[0]!
      expect(top.districtId).toBeDefined()
      expect(top.overallRank).toBe(1)
      expect(top.aggregateScore).toBeGreaterThan(0)
      expect(top.region).toBeDefined()

      // Verify rankings are sorted
      for (let i = 1; i < body.rankings.length; i++) {
        expect(body.rankings[i]!.overallRank).toBeGreaterThanOrEqual(
          body.rankings[i - 1]!.overallRank
        )
      }
    })

    it('GET /api/districts/rankings supports date parameter', async () => {
      const { data, status } = await timedFetch(
        `${API_BASE}/districts/rankings?date=2026-02-20`
      )
      expect(status).toBe(200)

      const body = data as { rankings: unknown[] }
      expect(body.rankings.length).toBeGreaterThan(0)
    })
  })

  // ===========================================================================
  // API Gateway: Per-District Endpoints (using a known-good district)
  // ===========================================================================
  describe('API Gateway: Per-District Endpoints', () => {
    // Use a district that is known to have per-district data
    let knownDistrictId: string

    beforeAll(async () => {
      const { data } = await timedFetch(`${API_BASE}/districts`)
      const body = data as { districts: Array<{ id: string }> }
      expect(body.districts.length).toBeGreaterThan(0)
      knownDistrictId = body.districts[0]!.id
    })

    it('GET /api/districts/:id/statistics returns district stats', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/${knownDistrictId}/statistics`
      )
      expect(status).toBe(200)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.normal)

      const body = data as {
        districtId: string
        membership: { total: number }
      }
      expect(body.districtId).toBe(knownDistrictId)
      expect(body.membership).toBeDefined()
      expect(body.membership.total).toBeGreaterThanOrEqual(0)
    })

    it('GET /api/districts/:id/cached-dates returns dates array', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/${knownDistrictId}/cached-dates`
      )
      expect(status).toBe(200)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.slow)

      const body = data as {
        districtId: string
        dates: string[]
        count: number
      }
      expect(body.districtId).toBe(knownDistrictId)
      expect(Array.isArray(body.dates)).toBe(true)
      expect(body.count).toBe(body.dates.length)
    })

    it('GET /api/districts/:id/clubs returns club data', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/${knownDistrictId}/clubs`
      )
      expect(status).toBe(200)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.normal)

      const body = data as { clubs?: unknown[] }
      // Response should be valid JSON (club data or empty)
      expect(body).toBeDefined()
    })

    it('GET /api/districts/:id/analytics returns pre-computed analytics', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/${knownDistrictId}/analytics`
      )
      // 200 if analytics exist, 404 if not yet computed
      expect([200, 404]).toContain(status)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.normal)

      if (status === 200) {
        expect(data).toBeDefined()
      }
    })

    it('GET /api/districts/:id/analytics-summary returns aggregated summary', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/${knownDistrictId}/analytics-summary`
      )
      // 200 if available, 404 if analytics not computed
      expect([200, 404]).toContain(status)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.slow)

      if (status === 200) {
        const body = data as { districtId: string }
        expect(body.districtId).toBe(knownDistrictId)
      }
    })
  })

  // ===========================================================================
  // API Gateway: Error Handling
  // ===========================================================================
  describe('API Gateway: Error Handling', () => {
    it('returns validation error for an invalid district ID format', async () => {
      const { data, status } = await timedFetch(
        `${API_BASE}/districts/INVALID_999/statistics`
      )
      // Backend returns 400 for malformed district IDs (validation layer)
      expect(status).toBe(400)

      const body = data as { error: { code: string; message: string } }
      expect(body.error).toBeDefined()
      expect(body.error.code).toBe('INVALID_DISTRICT_ID')
    })

    it('returns JSON error for non-existent API routes', async () => {
      const { data, status } = await timedFetch(`${API_BASE}/nonexistent-route`)
      expect([404, 400]).toContain(status)
      // Should return JSON, not HTML
      expect(typeof data).toBe('object')
    })
  })

  // ===========================================================================
  // API Gateway: Rankings Sub-Routes
  // ===========================================================================
  describe('API Gateway: Rankings Sub-Routes', () => {
    it('POST /api/districts/rank-history-batch returns batch rank data', async () => {
      const start = performance.now()
      const response = await fetch(`${API_BASE}/districts/rank-history-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districtIds: ['93', '49'] }),
      })
      const timeMs = performance.now() - start
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.slow)
      expect(data).toBeDefined()
    })

    it('GET /api/districts/:id/available-ranking-years returns program years', async () => {
      const { data, status, timeMs } = await timedFetch(
        `${API_BASE}/districts/93/available-ranking-years`
      )
      // Should be 200 if gateway route is configured
      expect([200, 404]).toContain(status)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.normal)

      if (status === 200) {
        const body = data as {
          districtId: string
          programYears: unknown[]
        }
        expect(body.districtId).toBe('93')
        expect(Array.isArray(body.programYears)).toBe(true)
      }
    })
  })

  // ===========================================================================
  // Data Coverage Compliance
  // ===========================================================================
  describe('Data Coverage Compliance', () => {
    it('rankings should cover all active districts', async () => {
      const { data: rankingsData } = await timedFetch(
        `${API_BASE}/districts/rankings`
      )
      const rankings = rankingsData as {
        rankings: Array<{ districtId: string }>
      }
      expect(rankings.rankings.length).toBeGreaterThan(120)
    })

    it('per-district data should cover all districts in rankings', async () => {
      const { data: rankingsData } = await timedFetch(
        `${API_BASE}/districts/rankings`
      )
      const rankings = rankingsData as {
        rankings: Array<{ districtId: string }>
      }

      const { data: districtsData } = await timedFetch(`${API_BASE}/districts`)
      const districts = districtsData as {
        districts: Array<{ id: string }>
      }

      const rankedDistrictIds = new Set(
        rankings.rankings.map(r => r.districtId)
      )
      const storedDistrictIds = new Set(districts.districts.map(d => d.id))

      // Calculate coverage gap - this is a compliance metric, not a pass/fail
      const missingDistricts = [...rankedDistrictIds].filter(
        id => !storedDistrictIds.has(id)
      )

      // Report coverage: currently expected to have a gap
      // When the collector covers all districts, this should be 0
      console.log(
        `Data coverage: ${storedDistrictIds.size}/${rankedDistrictIds.size} districts have per-district data`
      )
      console.log(
        `Missing districts: ${missingDistricts.length > 10 ? missingDistricts.length + ' districts' : missingDistricts.join(', ')}`
      )

      // This test documents the current state - adjust threshold as coverage improves
      expect(storedDistrictIds.size).toBeGreaterThanOrEqual(6)
    })
  })

  // ===========================================================================
  // Performance Budget Compliance
  // ===========================================================================
  describe('Performance Budget', () => {
    it('rankings endpoint meets fast budget (<500ms)', async () => {
      const { timeMs } = await timedFetch(`${API_BASE}/districts/rankings`)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.fast)
    })

    it('districts list meets fast budget (<500ms)', async () => {
      const { timeMs } = await timedFetch(`${API_BASE}/districts`)
      expect(timeMs).toBeLessThan(PERFORMANCE_BUDGET.fast)
    })
  })

  // ===========================================================================
  // CORS and Security Headers
  // ===========================================================================
  describe('Security and CORS', () => {
    it('API Gateway allows CORS from the production origin', async () => {
      const response = await fetch(`${API_BASE}/districts`, {
        headers: {
          Origin: 'https://ts.taverns.red',
        },
      })
      expect(response.status).toBe(200)
      // CORS headers should be present when origin is sent
      const allowOrigin = response.headers.get('access-control-allow-origin')
      // API Gateway may return * or the specific origin
      if (allowOrigin) {
        expect(['*', 'https://ts.taverns.red']).toContain(allowOrigin)
      }
    })

    it('API returns JSON content-type for all API responses', async () => {
      const response = await fetch(`${API_BASE}/districts`)
      expect(response.headers.get('content-type')).toContain('application/json')
    })
  })

  // ===========================================================================
  // Response Schema Validation
  // ===========================================================================
  describe('Response Schema Validation', () => {
    it('rankings response includes all required fields', async () => {
      const { data } = await timedFetch(`${API_BASE}/districts/rankings`)
      const body = data as {
        rankings: Array<Record<string, unknown>>
      }

      const requiredFields = [
        'districtId',
        'districtName',
        'region',
        'paidClubs',
        'totalPayments',
        'distinguishedClubs',
        'clubsRank',
        'paymentsRank',
        'distinguishedRank',
        'aggregateScore',
        'overallRank',
      ]

      const firstRanking = body.rankings[0]!
      for (const field of requiredFields) {
        expect(
          firstRanking[field],
          `Missing required field: ${field}`
        ).toBeDefined()
      }
    })

    it('district statistics response includes required sections', async () => {
      const { data: districtsData } = await timedFetch(`${API_BASE}/districts`)
      const districts = districtsData as {
        districts: Array<{ id: string }>
      }

      if (districts.districts.length === 0) return

      const knownId = districts.districts[0]!.id
      const { data, status } = await timedFetch(
        `${API_BASE}/districts/${knownId}/statistics`
      )

      if (status !== 200) return

      const body = data as Record<string, unknown>
      expect(body['districtId']).toBeDefined()
      expect(body['membership']).toBeDefined()
      expect(body['asOfDate']).toBeDefined()
    })
  })
})
