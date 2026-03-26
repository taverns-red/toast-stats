/**
 * Tests for ClosingDateRegistry (#203)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { ClosingDateRegistry } from '../utils/ClosingDateRegistry.js'

function createTempDir() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const dir = path.join(os.tmpdir(), `closing-date-test-${id}`)
  return {
    path: dir,
    cleanup: async () => fs.rm(dir, { recursive: true, force: true }),
  }
}

describe('ClosingDateRegistry', () => {
  let tempDir: { path: string; cleanup: () => Promise<void> }

  beforeEach(async () => {
    tempDir = createTempDir()
    await fs.mkdir(path.join(tempDir.path, 'docs'), { recursive: true })
  })

  afterEach(async () => {
    await tempDir.cleanup()
  })

  it('should read an empty registry when file does not exist', async () => {
    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })
    const data = await registry.read()

    expect(data.months).toEqual([])
    expect(data.description).toContain('closing dates')
  })

  it('should append a new closing date entry', async () => {
    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })

    const added = await registry.append({
      dataMonth: '2026-02',
      closingDate: '2026-03-13',
    })

    expect(added).toBe(true)

    const data = await registry.read()
    expect(data.months).toHaveLength(1)
    expect(data.months[0]?.dataMonth).toBe('2026-02')
    expect(data.months[0]?.closingDate).toBe('2026-03-13')
  })

  it('should deduplicate exact entries', async () => {
    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })

    await registry.append({
      dataMonth: '2026-02',
      closingDate: '2026-03-13',
    })

    const secondAdd = await registry.append({
      dataMonth: '2026-02',
      closingDate: '2026-03-13',
    })

    expect(secondAdd).toBe(false)

    const data = await registry.read()
    expect(data.months).toHaveLength(1)
  })

  it('should update closing date for same data month', async () => {
    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })

    await registry.append({
      dataMonth: '2026-02',
      closingDate: '2026-03-10',
    })

    await registry.append({
      dataMonth: '2026-02',
      closingDate: '2026-03-13',
    })

    const data = await registry.read()
    expect(data.months).toHaveLength(1)
    expect(data.months[0]?.closingDate).toBe('2026-03-13')
  })

  it('should sort entries by data month', async () => {
    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })

    await registry.append({
      dataMonth: '2026-03',
      closingDate: '2026-04-10',
    })

    await registry.append({
      dataMonth: '2026-01',
      closingDate: '2026-02-12',
    })

    await registry.append({
      dataMonth: '2026-02',
      closingDate: '2026-03-13',
    })

    const data = await registry.read()
    expect(data.months.map(m => m.dataMonth)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ])
  })

  it('should read an existing well-formed registry file', async () => {
    const existingData = {
      generatedAt: '2026-01-01T00:00:00Z',
      description: 'Test registry',
      months: [{ dataMonth: '2025-12', closingDate: '2026-01-08' }],
    }

    await fs.writeFile(
      path.join(tempDir.path, 'docs', 'month-end-closing-dates.json'),
      JSON.stringify(existingData)
    )

    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })
    const data = await registry.read()

    expect(data.months).toHaveLength(1)
    expect(data.months[0]?.dataMonth).toBe('2025-12')
  })

  it('should handle corrupt registry file gracefully', async () => {
    await fs.writeFile(
      path.join(tempDir.path, 'docs', 'month-end-closing-dates.json'),
      '{ invalid json }'
    )

    const registry = new ClosingDateRegistry({ projectRoot: tempDir.path })
    const data = await registry.read()

    expect(data.months).toEqual([])
  })
})
