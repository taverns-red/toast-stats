/**
 * ANSI stripping for job logs (#2418). Two shapes reach us:
 *
 *   - real ESC bytes, from `gh api --allow-escape-sequences .../logs`;
 *   - the literal two-character `^[` that `gh run view --log` substitutes
 *     for ESC when it sanitises output (`^[[31m1 failed^[[39m`).
 *
 * Both are removed, so a log is plain text whichever path produced it.
 */

const ESC_CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g
const ESC_OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g
const ESC_OTHER = /\u001b[@-Z\\-_]/g
const CARET_CSI = /\^\[\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(text: string): string {
  return text
    .replace(ESC_OSC, '')
    .replace(ESC_CSI, '')
    .replace(ESC_OTHER, '')
    .replace(CARET_CSI, '')
}
