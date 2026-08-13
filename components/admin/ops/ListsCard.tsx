'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
        <h3 className="text-sm font-semibold mb-2">{title}</h3>
        <div className="space-y-1">
          {items.map((i) => (
            <label key={`${i.resource_id}|${i.unit ?? ''}`} className="flex items-center gap-2 text-sm">
              <input type="checkbox" aria-label={i.name} checked={i.checked}
                onChange={(e) => handleToggle(list, i, e.target.checked)} />
              <span className={i.checked ? 'line-through text-gray-400' : ''}>{i.name}</span>
              <span className="ml-auto text-xs text-gray-500">{qtyLabel(i)}</span>
            </label>
          ))}
          {items.length === 0 && <p className="text-sm text-gray-500">Empty.</p>}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Shopping &amp; packing</CardTitle>
        <Link href={`/${orgSlug}/${eventSlug}/ops/print`} className="text-sm underline text-gray-700">Print lists</Link>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {renderList('Shopping list', 'shopping_list')}
          {renderList('Packing list', 'packing_list')}
        </div>
      </CardContent>
    </Card>
  )
}
