'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { toggleListItem } from '@/actions/event-ops'
import type { OpsPlan, OpsListItem } from '@/lib/types'

interface ListsCardProps {
  orgId: string
  eventId: string
  plan: OpsPlan
  orgSlug: string
  eventSlug: string
  onPlanChange: (next: OpsPlan) => void
}

function qtyLabel(i: OpsListItem): string {
  return i.unit ? `${i.qty} ${i.unit}` : `× ${i.qty}`
}

export function ListsCard({ orgId, eventId, plan, orgSlug, eventSlug, onPlanChange }: ListsCardProps) {
  const [error, setError] = useState<string | null>(null)

  async function handleToggle(list: 'shopping_list' | 'packing_list', item: OpsListItem, checked: boolean) {
    setError(null)
    try {
      await toggleListItem(orgId, eventId, list, item.resource_id, checked, item.unit)
      onPlanChange({
        ...plan,
        [list]: plan[list].map((x) => (
          x.resource_id === item.resource_id && (x.unit ?? null) === (item.unit ?? null) ? { ...x, checked } : x
        )),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  function renderList(title: string, list: 'shopping_list' | 'packing_list') {
    const items = plan[list]
    return (
      <div>
        <h5 className="mb-2 text-sm font-semibold">{title}</h5>
        <div className="space-y-1">
          {items.map((i) => (
            <label key={`${i.resource_id}|${i.unit ?? ''}`} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={i.name} checked={i.checked}
                onChange={(e) => handleToggle(list, i, e.target.checked)} />
              <span className={i.checked ? 'line-through text-muted-foreground' : ''}>{i.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{qtyLabel(i)}</span>
            </label>
          ))}
          {items.length === 0 && <EmptyState title="Empty." className="py-4" />}
        </div>
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h4 className="text-[13px] font-semibold">Shopping &amp; packing</h4>
        <Button variant="link" size="xs" nativeButton={false} render={<Link href={`/${orgSlug}/${eventSlug}/ops/print`} />}>
          Print lists
        </Button>
      </header>
      <div className="p-3">
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {renderList('Shopping list', 'shopping_list')}
          {renderList('Packing list', 'packing_list')}
        </div>
      </div>
    </section>
  )
}
