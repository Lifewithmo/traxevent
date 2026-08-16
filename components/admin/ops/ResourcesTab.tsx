'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusPill, type pillVariants } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createResource, updateResource, deleteResource } from '@/actions/resources'
import { formatMoney } from '@/lib/utils'
import type { OpsResource, WorkPackage, ResourceKind } from '@/lib/types'
import type { VariantProps } from 'class-variance-authority'

interface ResourcesTabProps {
  orgId: string
  isAdmin: boolean
  resources: OpsResource[]
  packages: WorkPackage[]
}

type Tone = NonNullable<VariantProps<typeof pillVariants>['tone']>

const KINDS: ResourceKind[] = ['consumable', 'reusable', 'serialized']

// One gray badge for every kind reads as "no state at all". Kinds behave
// differently at closeout — consumables are spent, reusables come home,
// serialized units are tracked individually — so they get differing tones.
const KIND_TONE: Record<ResourceKind, Tone> = {
  consumable: 'neutral',
  reusable: 'confirmed',
  serialized: 'pending',
}

export function ResourcesTab({ orgId, isAdmin, resources: initial, packages }: ResourcesTabProps) {
  const [resources, setResources] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ResourceKind>('consumable')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [pendingDelete, setPendingDelete] = useState<OpsResource | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // A resource referenced by any package line must not be deletable (handoff:
  // deleting in-use catalog entries breaks re-derive and closeout).
  const inUse = new Set(
    packages.flatMap((p) => p.lines.flatMap((l) => (l.kind === 'labor' ? [] : [l.resource_id])))
  )

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true); setError(null)
    try {
      const created = await createResource(orgId, {
        name: name.trim(),
        kind,
        ...(unit.trim() ? { unit: unit.trim() } : {}),
        ...(unitCost !== '' ? { unit_cost: Number(unitCost) } : {}),
      })
      setResources((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setUnit(''); setUnitCost('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add')
    } finally {
      setSaving(false)
    }
  }

  async function handleCostChange(r: OpsResource, value: string) {
    const unit_cost = value === '' ? null : Number(value)
    if (unit_cost === (r.unit_cost ?? null)) return
    try {
      await updateResource(orgId, r.id, { unit_cost })
      setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit_cost: unit_cost ?? undefined } : x)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleDelete(r: OpsResource) {
    setSaving(true); setError(null)
    try {
      await deleteResource(orgId, r.id)
      setResources((prev) => prev.filter((x) => x.id !== r.id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {/* Five columns don't fit a phone; scroll the ledger, not the page. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-2">Name</th><th>Kind</th><th>Unit</th><th>Unit cost</th><th />
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{r.name}</td>
                <td><StatusPill tone={KIND_TONE[r.kind]}>{r.kind}</StatusPill></td>
                <td>{r.unit ?? '—'}</td>
                <td>
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`Unit cost for ${r.name}`}
                        type="number" step="0.01" className="w-24"
                        defaultValue={r.unit_cost ?? ''}
                        onBlur={(e) => handleCostChange(r, e.target.value)}
                      />
                      {r.unit_cost !== undefined ? (
                        <span>{formatMoney(r.unit_cost)}</span>
                      ) : r.kind === 'consumable' ? (
                        // Only consumable costs feed the costing engine, so an
                        // unpriced one is a gap worth naming rather than a blank.
                        <span className="text-xs text-[var(--link)]">Add cost</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  ) : r.unit_cost !== undefined ? formatMoney(r.unit_cost) : '—'}
                </td>
                <td className="text-right">
                  {isAdmin && (
                    // Deliberately NOT a menu item: the disabled state IS the
                    // in-use guard, and it has to stay visible on the row.
                    <Button
                      variant="ghost" size="sm"
                      aria-label={`Delete ${r.name}`}
                      disabled={saving || inUse.has(r.id)}
                      title={inUse.has(r.id) ? 'In use by a package — remove it from the package first' : undefined}
                      onClick={() => setPendingDelete(r)}
                    >
                      Delete
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {resources.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    title="No resources yet"
                    description="Beans, milk, cups, machines — everything a package draws on."
                    action={
                      isAdmin ? (
                        <Button size="sm" onClick={() => nameRef.current?.focus()}>
                          Add your first resource
                        </Button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap border-t border-border pt-4">
          <div>
            <Label htmlFor="res-name">Name</Label>
            <Input id="res-name" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-kind">Kind</Label>
            <select
              id="res-kind" value={kind}
              onChange={(e) => setKind(e.target.value as ResourceKind)}
              className="block h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="res-unit">Unit</Label>
            <Input id="res-unit" placeholder="oz, each, gal" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-cost">Unit cost ($)</Label>
            <Input id="res-cost" type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={saving || !name.trim()}>Add resource</Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete resource?'}
        description="It leaves the catalog for good. Packages already using it can't be deleted, so nothing in flight breaks."
        confirmLabel="Delete"
        destructive
        busy={saving}
        onConfirm={async () => { if (pendingDelete) await handleDelete(pendingDelete) }}
      />
    </div>
  )
}
