/**
 * The PR file list the `changes` jobs classify (#2865 F3): a rename OUT of a
 * path lists only the new name as `filename`, so the old name must be read
 * from `previous_filename` or a move out of a preview path needs no preview.
 */
import { describe, it, expect } from 'vitest'
import { collectFilenames } from '../prChangedFiles'
import { needsPreview } from '../previewPaths'

describe('collectFilenames', () => {
  it('returns each filename', () => {
    expect(
      collectFilenames([{ filename: 'a.ts' }, { filename: 'b.ts' }])
    ).toEqual(['a.ts', 'b.ts'])
  })

  it('also returns the previous name of a rename', () => {
    expect(
      collectFilenames([
        { filename: 'docs/x.md', previous_filename: 'frontend/src/x.md' },
      ])
    ).toEqual(['docs/x.md', 'frontend/src/x.md'])
  })

  it('a rename out of a preview path still needs a preview', () => {
    const files = collectFilenames([
      { filename: 'docs/x.md', previous_filename: 'frontend/src/x.md' },
    ])
    expect(needsPreview(files)).toBe(true)
  })
})
