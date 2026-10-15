/**
 * Derive privacy denylists FROM recorded report fixtures instead of
 * hand-listing one sample name (#1592 security review, #1795).
 *
 * Independent of the parser under test: every `<table>` in the raw HTML is
 * walked with its own regex. Callers assert none of the returned strings
 * appear in the built/written dataset. Never print the returned values.
 */

/**
 * Every value of one personal column (by exact header text) across every
 * `<table>` in a recorded report.
 */
export function deriveColumnDenylist(html: string, header: string): string[] {
  // Read the cell's text nodes (the runs between tags) rather than "stripping"
  // tags out of the markup; some cells nest a tooltip <div>, so a `[^<]*`
  // cell regex would drop cells and shift the column index.
  const text = (cell: string): string =>
    cell
      .split(/<[^>]*>/)
      .join('')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const cellsOf = (tr: string): string[] =>
    [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m =>
      text(m[1] ?? '')
    )

  const values = new Set<string>()
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const trs = (table[1] ?? '').match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []
    const idx = cellsOf(trs[0] ?? '').indexOf(header)
    if (idx === -1) continue
    for (const tr of trs.slice(1)) {
      const v = cellsOf(tr)[idx]
      if (v) values.add(v)
    }
  }
  return [...values]
}

/**
 * Education Achievements: every `Member` cell, plus any bare 8-digit member ID
 * inside a "NNNNNNNN - Name" value on its own (the ID alone is identifying).
 */
export function deriveEducationMemberDenylist(html: string): string[] {
  const values = new Set<string>()
  for (const member of deriveColumnDenylist(html, 'Member')) {
    values.add(member)
    const id = member.match(/^(\d{8}) - /)?.[1]
    if (id) values.add(id)
  }
  return [...values]
}
