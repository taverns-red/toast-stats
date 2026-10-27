import type { Scenario } from './types'
import { v1 } from './v1'
import { v2 } from './v2'
import { v3 } from './v3'
import { v4 } from './v4'

export const SCENARIOS: Readonly<Record<string, Scenario>> = { v1, v2, v3, v4 }

export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id]
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${id}". Known: ${Object.keys(SCENARIOS).join(', ')}`
    )
  }
  return scenario
}
