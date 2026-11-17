/* Placeholder: the real guard lands in the next commit (#2827). */
export function isGaCollectUrl(_url: string): boolean {
  return false
}

export function installGaTransportGuard(): () => void {
  return () => {}
}

export function uninstallGaTransportGuard(): void {}
