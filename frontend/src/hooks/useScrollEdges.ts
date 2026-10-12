import type React from 'react'

export interface ScrollEdgeProps<T extends HTMLElement> {
  ref: React.RefCallback<T>
  'data-more-before'?: ''
  'data-more-after'?: ''
}

// Red stub (#1846) — implemented in the next commit.
export function useScrollEdges<T extends HTMLElement>(
  _contentKey?: unknown
): ScrollEdgeProps<T> {
  return { ref: () => undefined }
}
