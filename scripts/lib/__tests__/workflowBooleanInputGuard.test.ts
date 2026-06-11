import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import * as path from 'node:path'
import {
  findBooleanInputNames,
  findBooleanInputStringComparisons,
} from '../workflowBooleanInputGuard.js'

/**
 * Workflow boolean-input guard (#1133).
 *
 * `inputs.<boolean> == 'true'` in an Actions `if:` coerces true→1 vs
 * 'true'→NaN and never matches — the comparison is inert whatever the
 * operator selected. The sentinel below proves the rule fires on a
 * known-bad snippet (Lesson 082), and the repo sweep keeps every workflow
 * clean (Lesson 121).
 */

const KNOWN_BAD = `
on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run'
        type: boolean
        default: false
      mode:
        description: 'A string input'
        type: choice
jobs:
  x:
    steps:
      - name: delete
        if: inputs.dry_run != 'true'
        run: echo unsafe
      - name: fine string compare
        if: inputs.mode == 'prune'
        run: echo safe
      - name: fine boolean compare
        if: inputs.dry_run != true
        run: echo safe
`

describe('findBooleanInputNames', () => {
  it('finds boolean-typed inputs and ignores other types', () => {
    expect(findBooleanInputNames(KNOWN_BAD)).toEqual(['dry_run'])
  })
})

describe('findBooleanInputStringComparisons', () => {
  it('fires on a boolean input compared to a quoted string (sentinel, L082)', () => {
    const violations = findBooleanInputStringComparisons(KNOWN_BAD)
    expect(violations).toHaveLength(1)
    expect(violations[0].input).toBe('dry_run')
    expect(violations[0].text).toContain("inputs.dry_run != 'true'")
  })

  it('does not fire on string-input comparisons or boolean-literal comparisons', () => {
    const clean = KNOWN_BAD.replace("if: inputs.dry_run != 'true'", 'if: true')
    expect(findBooleanInputStringComparisons(clean)).toEqual([])
  })

  it('catches reversed and double-quoted forms', () => {
    const reversed = KNOWN_BAD.replace(
      "inputs.dry_run != 'true'",
      '"true" == inputs.dry_run'
    )
    expect(findBooleanInputStringComparisons(reversed)).toHaveLength(1)
  })
})

describe('repo sweep: no workflow compares a boolean input to a string', () => {
  const workflowsDir = path.resolve(__dirname, '../../../.github/workflows')

  for (const file of readdirSync(workflowsDir).filter(f =>
    /\.ya?ml$/.test(f)
  )) {
    it(`${file} has no inert boolean-input string comparisons`, () => {
      const source = readFileSync(path.join(workflowsDir, file), 'utf-8')
      const violations = findBooleanInputStringComparisons(source)
      expect(
        violations,
        violations
          .map(v => `${file}:${v.line} [${v.input}] ${v.text}`)
          .join('\n')
      ).toEqual([])
    })
  }
})
