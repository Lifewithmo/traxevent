'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { createResource, updateResource, deleteResource } from '@/actions/resources'
import { formatMoney } from '@/lib/utils'
import type { OpsResource, WorkPackage, ResourceKind } from '@/lib/types'

interface ResourcesTabProps {
  orgId: string
  isAdmin: boolean
  resources: OpsResource[]
  packages: WorkPackage[]
}

const KINDS: ResourceKind[] = ['consumable', 'reusable', 'serialized']

export function ResourcesTab({ orgId, isAdmin, resources: initial, packages }: ResourcesTabProps) {
  const [resources, setResources] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ResourceKind>('consumable')
  const [unit, setUnit] = useState('')
  const [unitCost, setUnitCost] = useState('')

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
    try {
      await updateResource(orgId, r.id, { unit_cost })
      setResources((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit_cost: unit_cost ?? undefined } : x)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  async function handleDelete(r: OpsResource) {
    if (!confirm(`Delete ${r.name}?`)) return
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2">Name</th><th>Kind</th><th>Unit</th><th>Unit cost</th><th />
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 font-medium">{r.name}</td>
              <td><Badge variant="secondary">{r.kind}</Badge></td>
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
                    {r.unit_cost !== undefined && <span>{formatMoney(r.unit_cost)}</span>}
                  </div>
                ) : r.unit_cost !== undefined ? formatMoney(r.unit_cost) : '—'}
              </td>
              <td className="text-right">
                {isAdmin && (
                  <Button
                    variant="ghost" size="sm"
                    aria-label={`Delete ${r.name}`}
                    disabled={saving || inUse.has(r.id)}
                    title={inUse.has(r.id) ? 'In use by a package — remove it from the package first' : undefined}
                    onClick={() => handleDelete(r)}
                  >
                    Delete
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {resources.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-gray-500">No resources yet. Add beans, milk, cups, machines…</td></tr>
          )}
        </tbody>
      </table>

      {isAdmin && (
        <div className="flex items-end gap-3 flex-wrap border-t pt-4">
          <div>
            <Label htmlFor="res-name">Name</Label>
            <Input id="res-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="res-kind">Kind</Label>
            <select
              id="res-kind" value={kind}
              onChange={(e) => setKind(e.target.value as ResourceKind)}
              className="block h-9 rounded-md border border-gray-300 px-2 text-sm"
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
    </div>
  )
}
