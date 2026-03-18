/**
 * Unit Test: Route Module Composition
 *
 * Verifies that the districts API router is properly composed from modules,
 * responds with consistent error formats, and handles edge cases correctly.
 *
 * Converted from property-based tests — PBT generated random strings for
 * district IDs and dates but used seeded runs (20 iterations), making them
 * effectively fixed test scenarios.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import districtRoutes from '../index.js'
import { cacheService } from '../../../services/CacheService.js'

describe('Route Module Composition', () => {
  let app: Express

  beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/districts', districtRoutes)
  })

  beforeEach(() => {
    cacheService.clear()
  })

  afterAll(() => {
    cacheService.clear()
  })

  it('should have all expected routes registered', () => {
    const routerStack = (districtRoutes as express.Router).stack
    expect(routerStack.length).toBeGreaterThan(0)
    expect(districtRoutes).toBeDefined()
    expect(typeof districtRoutes).toBe('function')
    expect(routerStack.length).toBeGreaterThanOrEqual(3)
  })

  it.each([
    ['special characters', '!@#$%'],
    ['spaces', 'a b c'],
    ['unicode', '日本語'],
  ])(
    'should respond with proper error format for invalid district ID: %s',
    async (_desc, invalidDistrictId) => {
      const response = await request(app).get(
        `/api/districts/${encodeURIComponent(invalidDistrictId)}/statistics`
      )

      expect([400, 404, 503]).toContain(response.status)

      if (response.status === 400) {
        expect(response.body).toHaveProperty('error')
        expect(response.body.error).toHaveProperty('code')
        expect(response.body.error).toHaveProperty('message')
      }
    }
  )

  it.each([
    ['not a date', 'hello'],
    ['partial date', '2024-01'],
    ['no separators', '20240115'],
    ['extra chars', '2024-01-15T00:00'],
  ])(
    'should respond with proper error format for invalid date: %s',
    async (_desc, invalidDate) => {
      const response = await request(app).get(
        `/api/districts/rankings?date=${encodeURIComponent(invalidDate)}`
      )

      expect([400, 503]).toContain(response.status)
      expect(response.body).toHaveProperty('error')
      expect(response.body.error).toHaveProperty('code')
      expect(response.body.error).toHaveProperty('message')
    }
  )

  it.each(['1', '42', 'F', 'A1', 'abc'])(
    'should respond with consistent structure for valid district ID format: %s',
    async validDistrictId => {
      const response = await request(app).get(
        `/api/districts/${validDistrictId}/statistics`
      )

      expect([200, 404, 500, 503]).toContain(response.status)
      expect(response.body).toBeDefined()

      const hasError = response.body.error !== undefined
      if (response.status === 200 && !hasError) {
        expect(response.body).toHaveProperty('_snapshot_metadata')
      } else {
        expect(response.body).toHaveProperty('error')
      }
    }
  )
})
