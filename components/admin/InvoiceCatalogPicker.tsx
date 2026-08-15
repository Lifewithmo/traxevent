'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { listWorkPackages, createWorkPackage } from '@/actions/work-packages'
import { searchCatalog, type CatalogEntry } from '@/lib/catalog-search'
import type { InvoiceSourceRef } from '@/lib/types'

interface InvoiceCatalogPickerProps {
  orgId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: { description: string; unit_price: number; source?: InvoiceSourceRef }) => void
}

// Parse a numeric text field: empty → 0, NaN guarded to 0.
function toNumber(v: string): number {
  if (v.trim() === '') return 0
  const n = Number(v)
  return Number.isNaN(n) ? 0 : n
}

export function InvoiceCatalogPicker({ orgId, open, onOpenChange, onPick }: InvoiceCatalogPickerProps) {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPrice, setCreatePrice] = useState('')
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    setLoadError(null)
    listWorkPackages(orgId)
      .then((packages) => {
        setEntries(packages.map((p) => ({ id: p.id, name: p.name, description: p.description, price: p.price })))
        setLoaded(true)
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load catalog')
      })
      .finally(() => setLoading(false))
  }, [open, loaded, orgId])

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setQuery('')
      setCreating(false)
      setCreateName('')
      setCreatePrice('')
      setCreateError(null)
    }
  }

  function handlePickPackage(pkg: CatalogEntry) {
    onPick({ description: pkg.name, unit_price: pkg.price, source: { type: 'manual', id: pkg.id, label: 'Catalog' } })
    handleOpenChange(false)
  }

  function handleAddOneOff() {
    onPick({ description: query, unit_price: 0 })
    handleOpenChange(false)
  }

  function startCreate() {
    setCreating(true)
    setCreateName(query)
    setCreatePrice('')
    setCreateError(null)
  }

  async function handleCreateSubmit() {
    const name = createName.trim()
    if (!name) {
      setCreateError('Name is required')
      return
    }
    setCreateSaving(true)
    setCreateError(null)
    try {
      const pkg = await createWorkPackage(orgId, { name, price: toNumber(createPrice), lines: [] })
      onPick({ description: pkg.name, unit_price: pkg.price, source: { type: 'manual', id: pkg.id, label: 'Catalog' } })
      handleOpenChange(false)
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create catalog item')
    } finally {
      setCreateSaving(false)
    }
  }

  const results = searchCatalog(entries, query)
  const trimmedQuery = query.trim()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add from catalog</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search catalog…"
            autoFocus
          />

          {loading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}

          {!loading && !loadError && (
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {results.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => handlePickPackage(pkg)}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-muted"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{pkg.name}</span>
                    {pkg.description && (
                      <span className="text-xs text-muted-foreground">{pkg.description}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">${pkg.price.toFixed(2)}</span>
                </button>
              ))}

              {results.length === 0 && trimmedQuery !== '' && !creating && (
                <div className="flex flex-col gap-2 py-2">
                  <p className="text-sm text-muted-foreground">No catalog items match &ldquo;{trimmedQuery}&rdquo;.</p>
                  <Button type="button" variant="outline" size="sm" onClick={startCreate}>
                    Create &ldquo;{trimmedQuery}&rdquo; as a catalog item
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddOneOff}>
                    Add &ldquo;{trimmedQuery}&rdquo; as a one-off line
                  </Button>
                </div>
              )}

              {results.length === 0 && trimmedQuery === '' && (
                <p className="py-2 text-sm text-muted-foreground">No catalog items yet.</p>
              )}
            </div>
          )}

          {creating && (
            <div className="flex flex-col gap-3 rounded-lg border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="catalog-picker-create-name">Name</Label>
                <Input
                  id="catalog-picker-create-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="catalog-picker-create-price">Price</Label>
                <Input
                  id="catalog-picker-create-price"
                  type="number"
                  value={createPrice}
                  onChange={(e) => setCreatePrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={handleCreateSubmit} disabled={createSaving}>
                  {createSaving ? 'Creating…' : 'Create & add'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
