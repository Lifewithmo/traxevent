export interface CatalogEntry {
  id: string
  name: string
  description?: string
  price: number
}

// Case-insensitive AND-match across name + description. Blank query = everything.
export function searchCatalog(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((e) => {
    const haystack = `${e.name} ${e.description ?? ''}`.toLowerCase()
    return terms.every((t) => haystack.includes(t))
  })
}
