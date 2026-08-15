'use client'

import Link from 'next/link'
import { dropPhase } from '@/lib/storefront/drop-logic'
import type { Drop, DropPhase } from '@/lib/types'

const PHASE_LABEL: Record<DropPhase, string> = {
  draft: 'Draft', upcoming: 'Scheduled', open: 'Open', ended: 'Ended', archived: 'Archived',
}
const PHASE_STYLE: Record<DropPhase, string> = {
  draft: 'bg-gray-100 text-gray-600',
  upcoming: 'bg-amber-100 text-amber-800',
  open: 'bg-emerald-100 text-emerald-800',
  ended: 'bg-gray-100 text-gray-500',
  archived: 'bg-gray-100 text-gray-400',
}

export function DropsTab({ orgSlug, drops, stats, isAdmin }: {
  orgSlug: string
  drops: Drop[]
  stats?: Record<string, { count: number; revenue: number }>
  isAdmin: boolean
}) {
  const now = new Date().toISOString()
  const visible = drops.filter((d) => d.status !== 'archived')
  return (
    <div>
      {isAdmin && (
        <div className="mb-4">
          <Link
            href={`/${orgSlug}/drops/new`}
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            New drop
          </Link>
        </div>
      )}
      {visible.length === 0 && (
        <p className="text-sm text-gray-500">
          No drops yet. Create products, then schedule your first drop — subscribers get an email when you publish.
        </p>
      )}
      <div className="grid gap-3">
        {visible.map((d) => {
          const phase = dropPhase(d, now)
          return (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{d.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_STYLE[phase]}`}>
                    {PHASE_LABEL[phase]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500">
                  {d.items.length} items · pickup {d.pickup.location_name}
                  {stats?.[d.id] ? ` · ${stats[d.id].count} orders · $${stats[d.id].revenue.toFixed(2)}` : ''}
                </p>
              </div>
              <div className="flex flex-none gap-2 text-sm">
                {phase !== 'draft' && (
                  <Link href={`/${orgSlug}/drop-orders/${d.id}`} className="rounded-md border px-3 py-1.5 font-medium">
                    Orders
                  </Link>
                )}
                <Link href={`/${orgSlug}/drops/${d.id}`} className="rounded-md border px-3 py-1.5 font-medium">
                  {d.status === 'draft' ? 'Edit' : 'Manage'}
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
