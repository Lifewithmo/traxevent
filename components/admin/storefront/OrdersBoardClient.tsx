'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { markOrderPickedUp, cancelOrder } from '@/actions/orders'
import type { Drop, Order } from '@/lib/types'

type View = 'orders' | 'prep'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function OrdersBoardClient({
  orgId, orgSlug, drop, orders: initial, isAdmin,
}: {
  orgId: string
  orgSlug: string
  drop: Drop
  orders: Order[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [orders, setOrders] = useState(initial)
  const [view, setView] = useState<View>('orders')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const live = orders.filter((o) => o.status === 'confirmed' || o.status === 'picked_up')
  const revenue = live.reduce((s, o) => s + o.total, 0)
  const prep = new Map<string, { name: string; qty: number }>()
  for (const o of live) {
    for (const l of o.lines) {
      const cur = prep.get(l.product_id)
      prep.set(l.product_id, { name: l.name, qty: (cur?.qty ?? 0) + l.qty })
    }
  }

  async function act(orderId: string, fn: () => Promise<void>, next: Order['status']) {
    setBusyId(orderId)
    setError(null)
    try {
      await fn()
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <Link href={`/${orgSlug}/drops`} className="text-sm text-gray-500">← All drops</Link>
          <h1 className="text-xl font-bold">{drop.title}</h1>
          <p className="text-sm text-gray-500">
            {live.length} orders · {money(revenue)}
          </p>
        </div>
        <Button variant="outline" onClick={() => router.refresh()}>Refresh</Button>
      </header>

      <div className="mb-4 flex gap-1 border-b" role="tablist">
        {(['orders', 'prep'] as View[]).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? 'border-gray-900' : 'border-transparent text-gray-500'}`}>
            {v === 'orders' ? 'Orders' : 'Prep'}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600" aria-live="polite">{error}</p>}

      {view === 'prep' ? (
        <div className="grid gap-2">
          {[...prep.values()].sort((a, b) => b.qty - a.qty).map((p) => (
            <div key={p.name} className="flex items-center gap-3 rounded-xl border bg-white p-4 text-lg">
              <span className="font-bold">{p.qty} ×</span>
              <span>{p.name}</span>
            </div>
          ))}
          {prep.size === 0 && <p className="text-sm text-gray-500">Nothing to prep yet.</p>}
        </div>
      ) : (
        drop.pickup.windows.map((w) => {
          const windowOrders = orders
            .filter((o) => o.pickup_window_id === w.id && o.status !== 'pending' && o.status !== 'canceled')
            .sort((a, b) => (a.pickup_slot ?? '').localeCompare(b.pickup_slot ?? '') || (a.number ?? 0) - (b.number ?? 0))
          return (
            <section key={w.id} className="mb-6">
              <h2 className="mb-2 text-sm font-semibold text-gray-600">
                {w.day} · {w.start}–{w.end} · {drop.pickup.location_name}
              </h2>
              <div className="grid gap-2">
                {windowOrders.map((o) => (
                  <div key={o.id} data-testid={`order-${o.id}`}
                    className={`rounded-xl border bg-white p-4 ${o.status === 'picked_up' ? 'opacity-50' : ''} ${o.status === 'refunded' ? 'opacity-50 line-through' : ''}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold">#{o.number} <span className="font-normal">{o.buyer.name}</span></p>
                      <p className="text-sm text-gray-500">{o.pickup_slot ?? ''} {money(o.total)}</p>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {o.lines.map((l) => `${l.qty}× ${l.name}`).join(' · ')}
                    </p>
                    <div className="mt-3 flex gap-2">
                      {o.status === 'confirmed' && (
                        <Button className="flex-1 py-5" disabled={busyId === o.id}
                          onClick={() => act(o.id, () => markOrderPickedUp(orgId, o.id), 'picked_up')}>
                          Picked up
                        </Button>
                      )}
                      {isAdmin && (o.status === 'confirmed' || o.status === 'picked_up') && (
                        <Button variant="outline" disabled={busyId === o.id}
                          onClick={() => {
                            if (window.confirm(`Refund order #${o.number} (${money(o.total)}) to ${o.buyer.name}?`)) {
                              act(o.id, () => cancelOrder(orgId, o.id), 'refunded')
                            }
                          }}>
                          Cancel & refund
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {windowOrders.length === 0 && <p className="text-sm text-gray-400">No orders in this window.</p>}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
