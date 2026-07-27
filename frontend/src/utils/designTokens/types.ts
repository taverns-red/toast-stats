/**
 * Design Token Types
 *
 * Core interfaces for the Toastmasters design token system.
 */

export interface DesignToken {
  name: string
  value: string
  category:
    'color' | 'typography' | 'spacing' | 'gradient' | 'radius' | 'shadow'
  description: string
  usage: string[]
}

export interface ColorToken extends DesignToken {
  category: 'color'
  hex: string
  rgb: { r: number; g: number; b: number }
  opacity?: number
  contrastRatio?: number
}
