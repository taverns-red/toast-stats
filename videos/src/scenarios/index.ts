import type { Scenario } from './types'
import { v1 } from './v1'
import { v2 } from './v2'
import { v3 } from './v3'
import { v4 } from './v4'
import { v5 } from './v5'
import { v6 } from './v6'
import { v7 } from './v7'
import { v8 } from './v8'
import { v9 } from './v9'
import { v10 } from './v10'
import { v14 } from './v14'
import { v12 } from './v12'
import { v15 } from './v15'
import { v11 } from './v11'
import { v13 } from './v13'
import { v16 } from './v16'

export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10,
  v14,
  v12,
  v15,
  v11,
  v13,
  v16,
}

export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id]
  if (!scenario) {
    throw new Error(
      `Unknown scenario "${id}". Known: ${Object.keys(SCENARIOS).join(', ')}`
    )
  }
  return scenario
}
