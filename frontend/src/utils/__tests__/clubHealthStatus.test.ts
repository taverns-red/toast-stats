/**
 * clubHealthStatus — single source of truth for health-status pill rendering
 * shared by the desktop ClubsTable row and the mobile ClubCard (#671, epic
 * #665 Sprint 5). Locks the lesson-052 invariant: one label + one modifier per
 * status, used by both surfaces.
 */
import { describe, it, expect } from 'vitest'
import type { ClubHealthStatus } from '../../hooks/useDistrictAnalytics'
import {
  getClubHealthStatusLabel,
  getClubHealthStatusPillModifier,
  getClubHealthStatusShortLabel,
} from '../clubHealthStatus'

describe('clubHealthStatus', () => {
  const cases: Array<[ClubHealthStatus, string, string]> = [
    ['thriving', 'Thriving', 'clubs-status-pill--thriving'],
    ['vulnerable', 'Vulnerable', 'clubs-status-pill--vulnerable'],
    [
      'intervention-required',
      'Intervention Required',
      'clubs-status-pill--intervention',
    ],
  ]

  it.each(cases)(
    'maps %s → label "%s" and modifier "%s"',
    (status, label, modifier) => {
      expect(getClubHealthStatusLabel(status)).toBe(label)
      expect(getClubHealthStatusPillModifier(status)).toBe(modifier)
    }
  )

  // #1833: the compact mobile row has ~300 px for name + chip at 375 px; the
  // 2-word label would leave the club name ~90 px. One word per status, still
  // distinct and still paired with the glyph, so meaning never rests on colour.
  it.each([
    ['thriving', 'Thriving'],
    ['vulnerable', 'Vulnerable'],
    ['intervention-required', 'Intervention'],
  ] as Array<[ClubHealthStatus, string]>)(
    'short label for %s is "%s"',
    (status, label) => {
      expect(getClubHealthStatusShortLabel(status)).toBe(label)
    }
  )
})
