/**
 * #1592 security review — derive the privacy denylist FROM the recorded
 * Education Achievements fixture instead of hand-listing one sample name.
 *
 * Independent of the parser under test: every `<table>` in the raw HTML is
 * walked with its own regex, every `Member` cell is collected, and any bare
 * 8-digit member ID inside a "NNNNNNNN - Name" value is added on its own (the
 * ID alone is identifying). Callers assert none of these strings appear in the
 * built/written dataset. Never print the returned values.
 */
export function deriveEducationMemberDenylist(html: string): string[] {
  // Read the cell's text nodes (the runs between tags) rather than "stripping"
  // tags out of the markup; some cells nest a tooltip <div>, so a `[^<]*`
  // cell regex would drop cells and shift the Member column index.
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
    const memberIdx = cellsOf(trs[0] ?? '').indexOf('Member')
    if (memberIdx === -1) continue
    for (const tr of trs.slice(1)) {
      const member = cellsOf(tr)[memberIdx]
      if (!member) continue
      values.add(member)
      const id = member.match(/^(\d{8}) - /)?.[1]
      if (id) values.add(id)
    }
  }
  return [...values]
}
