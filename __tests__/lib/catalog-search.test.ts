import { describe, it, expect } from 'vitest'
import { searchCatalog, type CatalogEntry } from '@/lib/catalog-search'

const entries: CatalogEntry[] = [
  { id: '1', name: 'Drip coffee service', description: '2 hours, 50 guests', price: 650 },
  { id: '2', name: 'Cold Espresso Bar', price: 450 },
  { id: '3', name: 'Add-on: oat milk', price: 40 },
]

describe('searchCatalog', () => {
  it('returns all entries for a blank query', () => {
    expect(searchCatalog(entries, '  ')).toHaveLength(3)
  })
  it('matches name case-insensitively', () => {
    expect(searchCatalog(entries, 'espresso').map((e) => e.id)).toEqual(['2'])
  })
  it('matches description text', () => {
    expect(searchCatalog(entries, 'guests').map((e) => e.id)).toEqual(['1'])
  })
  it('matches every word of a multi-word query (AND)', () => {
    expect(searchCatalog(entries, 'oat add')).toHaveLength(1)
    expect(searchCatalog(entries, 'oat espresso')).toHaveLength(0)
  })
})
