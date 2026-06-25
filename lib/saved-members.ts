import type { SavedFamilyMember } from '@/lib/types'

type Incoming = { first_name: string; last_name: string; birth_year: number; gender: string }

function key(m: { first_name: string; last_name: string; birth_year: number }): string {
  return `${m.first_name.trim().toLowerCase()}|${m.last_name.trim().toLowerCase()}|${m.birth_year}`
}

// Append incoming members not already saved (dedup by name+birth_year, case/space-insensitive,
// across both the existing set and the incoming batch). Blank-first-name entries are skipped.
export function mergeSavedMembers(
  existing: SavedFamilyMember[],
  incoming: Incoming[],
  makeId: () => string
): SavedFamilyMember[] {
  const seen = new Set(existing.map(key))
  const additions: SavedFamilyMember[] = []
  for (const m of incoming) {
    if (!m.first_name.trim()) continue
    const k = key(m)
    if (seen.has(k)) continue
    seen.add(k)
    additions.push({ id: makeId(), first_name: m.first_name, last_name: m.last_name, birth_year: m.birth_year, gender: m.gender })
  }
  return [...existing, ...additions]
}
