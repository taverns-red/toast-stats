import type { Scenario } from './types'
import { v2 } from './v2'

export const SCENARIOS: Readonly<Record<string, Scenario>> = { v2 }

export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id]
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${id}". Known: ${Object.keys(SCENARIOS).join(', ')}`
    )
  }
  return scenario
}
