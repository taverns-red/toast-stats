import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { findUninjectedTransformServiceConstructions } from '../services/transformServiceRegistryGuard.js'

/**
 * #1160 — structurally enforce TransformService's closing-date-registry
 * injection contract (follow-up to the #1129 fail-closed chain).
 *
 * The contract: `closingDateRegistry` is optional on the config TYPE (so test
 * fixtures can opt into legacy fail-open), but every PRODUCTION construction
 * site MUST inject it. A forgetful site silently reverts to fail-open and can
 * publish a closing-window date under its raw date. This guard turns the
 * doc-comment contract into a CI-enforced one.
 */
describe('TransformService registry-injection guard (#1160)', () => {
  describe('detector — must catch a known-bad snippet (Lesson 82)', () => {
    it('flags a construction that omits closingDateRegistry', () => {
      const bad = `
        const svc = new TransformService({
          cacheDir: '/tmp/x',
          logger,
        })
      `
      const violations = findUninjectedTransformServiceConstructions(bad)
      expect(violations).toHaveLength(1)
      expect(violations[0].snippet).toContain('cacheDir')
    })

    it('does NOT flag a construction that injects the registry literally', () => {
      const good = `
        const svc = new TransformService({
          cacheDir: '/tmp/x',
          closingDateRegistry: await loadClosingDateRegistryMonths(),
        })
      `
      expect(findUninjectedTransformServiceConstructions(good)).toHaveLength(0)
    })

    it('does NOT flag a pass-through construction (option spread by key)', () => {
      const good = `
        this.transformService = new TransformService({
          cacheDir: options.cacheDir,
          logger: options.logger,
          closingDateRegistry: options.closingDateRegistry,
        })
      `
      expect(findUninjectedTransformServiceConstructions(good)).toHaveLength(0)
    })

    it('does NOT flag the token when it appears only in a comment (Lesson 84)', () => {
      const commented = `
        // A doc-comment may mention new TransformService(...) in prose, e.g.
        // "any production new TransformService({ cacheDir }) site MUST inject".
        /* block: new TransformService({ cacheDir: x }) is just an example */
        const real = new TransformService({ cacheDir, closingDateRegistry })
      `
      expect(
        findUninjectedTransformServiceConstructions(commented)
      ).toHaveLength(0)
    })

    it('flags exactly the uninjected site when good and bad are interleaved', () => {
      const mixed = `
        new TransformService({ cacheDir: a, closingDateRegistry: r })
        new TransformService({ cacheDir: b })
      `
      const violations = findUninjectedTransformServiceConstructions(mixed)
      expect(violations).toHaveLength(1)
      expect(violations[0].snippet).toContain('cacheDir: b')
    })
  })

  describe('production source — every site injects the registry', () => {
    it('has zero uninjected TransformService constructions in src/', async () => {
      const srcDir = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..'
      )

      async function collectTsFiles(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        const files: string[] = []
        for (const entry of entries) {
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            // Skip test directories — fixtures legitimately omit the registry.
            if (entry.name === '__tests__' || entry.name === 'tests') continue
            files.push(...(await collectTsFiles(full)))
          } else if (
            entry.name.endsWith('.ts') &&
            !entry.name.endsWith('.test.ts') &&
            // The guard module itself names the token in its constant and
            // doc-comments; it never constructs the service.
            entry.name !== 'transformServiceRegistryGuard.ts'
          ) {
            files.push(full)
          }
        }
        return files
      }

      const files = await collectTsFiles(srcDir)
      const offenders: string[] = []
      for (const file of files) {
        const source = await fs.readFile(file, 'utf-8')
        const violations = findUninjectedTransformServiceConstructions(source)
        if (violations.length > 0) {
          offenders.push(
            `${path.relative(srcDir, file)}: ${violations.length} site(s)`
          )
        }
      }

      expect(offenders).toEqual([])
    })
  })
})
