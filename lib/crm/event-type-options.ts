import type { Lead, Org } from '@/lib/types'

/**
 * The event-type chip vocabulary for the New Opportunity form (inc 1, contract
 * C5's `eventTypeOptions`), computed server-side and threaded down as plain
 * strings.
 *
 * ONE RULE, TWO PAGES. The pipeline page feeds it the whole org's leads; the
 * cockpit page feeds it one customer's opportunities. Shared here rather than
 * duplicated in each page.tsx so the two create surfaces can never grow
 * different chip rows from the same data.
 *
 * Ordering is the recognition hierarchy (Nielsen #6):
 *   1. profile names, in PROFILE order — the org's authoritative vocabulary,
 *      the names that drive the capacity verdict's per-type requirement;
 *   2. then the org's own historical free-text types by frequency desc — what
 *      the operator actually says, most-said first. Ties keep first-seen order
 *      (Array.prototype.sort is stable), so the list is deterministic.
 *
 * Dedupe is trimmed + case-insensitive — "  wedding " and "WEDDING" are the
 * same word as the "Wedding" profile — matching how the capacity engine itself
 * matches free-text `lead.event_type` against profile names (lib/types.ts:47).
 * A historical entry keeps its first-seen trimmed casing; a profile keeps the
 * profile's own casing (it is the configured, authoritative spelling).
 *
 * Capped at 8 TOTAL (spec §1: event types are n:few — 3–10 — and a chip row
 * longer than that stops being recognition and becomes a second list to scan).
 */
export function buildEventTypeOptions(
  profiles: Org['event_type_profiles'],
  leads: Array<Pick<Lead, 'event_type'>>
): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const p of profiles ?? []) {
    const name = p.name.trim()
    const key = name.toLowerCase()
    if (name === '' || seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }

  // First-seen display casing + count per normalized key. Map preserves
  // insertion order, which is what makes the frequency tie-break deterministic.
  const history = new Map<string, { display: string; count: number }>()
  for (const l of leads) {
    const display = l.event_type?.trim() ?? ''
    if (display === '') continue
    const key = display.toLowerCase()
    if (seen.has(key)) continue // already a profile chip
    const entry = history.get(key)
    if (entry) entry.count += 1
    else history.set(key, { display, count: 1 })
  }

  const ranked = [...history.values()].sort((a, b) => b.count - a.count)
  for (const { display } of ranked) out.push(display)

  return out.slice(0, 8)
}
