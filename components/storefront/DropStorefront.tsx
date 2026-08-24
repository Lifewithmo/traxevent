'use client'

import { useMemo, useState } from 'react'
import { readableTextOn } from '@/lib/branding'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DropCheckout, type CheckoutRequest } from '@/components/storefront/DropCheckout'
import { SubscribeCard } from '@/components/storefront/SubscribeCard'
import type { PublicDrop } from '@/actions/storefront-public'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function windowLabel(w: PublicDrop['pickup']['windows'][number]): string {
  return `${w.day} · ${w.start}–${w.end}`
}

// SSR-SAFE BY CONSTRUCTION: this public page server-renders, so any clock
// face must be byte-identical between the server pass and hydration — an
// ambient-zone toLocale* here bakes the SERVER's face into the HTML, the
// browser re-formats in the viewer's zone, and React aborts hydration
// (minified #418), leaving every button dead: customers cannot order. That
// is the /checkin crash class (PR #134). Pickup happens at a physical place,
// so the honest zone is the DROP's own (Drop.timezone, IANA, captured from
// the seller's browser at creation) — which is also zone-stable everywhere:
// no hydration gate, no placeholder flicker. Locale is pinned too ('en-US'):
// the server's ICU default need not match the viewer's, and a locale drift
// is the same crash. timeZoneName labels the face ('… 10:00 AM MDT') so an
// out-of-town viewer isn't misled by a pinned zone. Exported for tests.
const OPENS_AT_OPTS = {
  month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
} as const
export function formatOpensAt(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', { ...OPENS_AT_OPTS, timeZone })
  } catch {
    // A malformed stored zone degrades to a LABELED UTC face — never to the
    // ambient zone, which would resurrect the hydration crash.
    return new Date(iso).toLocaleString('en-US', { ...OPENS_AT_OPTS, timeZone: 'UTC' })
  }
}

function slotOptions(w: PublicDrop['pickup']['windows'][number]): string[] {
  if (!w.slot_minutes) return []
  const out: string[] = []
  const [sh, sm] = w.start.split(':').map(Number)
  const [eh, em] = w.end.split(':').map(Number)
  for (let t = sh * 60 + sm; t < eh * 60 + em; t += w.slot_minutes) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return out
}

export function DropStorefront({ drop }: { drop: PublicDrop }) {
  const accent = drop.org.accent_color ?? '#111827'
  const accentText = readableTextOn(accent)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [step, setStep] = useState<'menu' | 'checkout'>('menu')
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' })
  const [windowId, setWindowId] = useState(drop.pickup.windows[0]?.id ?? '')
  const [slot, setSlot] = useState('')
  const [tipPct, setTipPct] = useState(0)

  const itemById = useMemo(() => new Map(drop.items.map((i) => [i.product_id, i])), [drop.items])
  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0)
  const subtotal = cartLines.reduce((s, [id, qty]) => s + (itemById.get(id)?.price ?? 0) * qty, 0)
  const tax = drop.tax_rate ? Math.round(subtotal * drop.tax_rate) / 100 : 0
  // Derived from the subtotal every render (not a dollar snapshot) so it
  // stays correct if the cart changes while a tip percent is selected.
  const tip = Math.round(subtotal * tipPct * 100) / 100
  const total = Math.round((subtotal + tax + tip) * 100) / 100
  const selectedWindow = drop.pickup.windows.find((w) => w.id === windowId)
  const needsSlot = !!selectedWindow?.slot_minutes
  const detailsComplete = buyer.name.trim() !== '' && buyer.email.includes('@') && !!windowId && (!needsSlot || !!slot)

  function add(id: string, delta: number) {
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }))
  }

  const request: CheckoutRequest = {
    handle: drop.org.handle,
    drop_id: drop.id,
    cart: cartLines.map(([product_id, qty]) => ({ product_id, qty })),
    buyer: { name: buyer.name.trim(), email: buyer.email.trim(), ...(buyer.phone.trim() ? { phone: buyer.phone.trim() } : {}) },
    pickup_window_id: windowId,
    ...(needsSlot && slot ? { pickup_slot: slot } : {}),
    ...(tip > 0 ? { tip } : {}),
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm font-medium" style={{ color: accent }}>{drop.org.display_name}</p>
        <h1 className="text-3xl font-bold">{drop.title}</h1>
        {drop.note && <p className="mt-2 text-sm text-gray-600">{drop.note}</p>}
        <p className="mt-2 text-sm text-gray-500">
          Pickup: {drop.pickup.location_name}
          {drop.pickup.address ? ` — ${drop.pickup.address}` : ''}
        </p>
      </header>

      {drop.phase === 'upcoming' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-4 text-sm">
            Orders open {formatOpensAt(drop.opens_at, drop.timezone)}.
          </div>
          <SubscribeCard handle={drop.org.handle} source="drop_page" />
        </div>
      )}
      {drop.phase === 'ended' && (
        <div className="space-y-4">
          <div className="rounded-xl border p-4 text-sm">Sales have ended for this drop.</div>
          <SubscribeCard handle={drop.org.handle} source="drop_page" />
        </div>
      )}

      <main className="mt-6 grid gap-3">
        {drop.items.map((item) => (
          <div key={item.product_id} className="flex items-center gap-3 rounded-2xl border p-3">
            {item.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photo_url} alt="" className="h-16 w-16 flex-none rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{item.name}</p>
              <p className="text-sm text-gray-600">{money(item.price)}</p>
              {item.description && <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>}
            </div>
            {drop.phase === 'open' && !item.sold_out && step === 'menu' ? (
              <div className="flex flex-none items-center gap-2">
                {(cart[item.product_id] ?? 0) > 0 && (
                  <>
                    <Button variant="outline" size="sm" aria-label={`Remove ${item.name}`} onClick={() => add(item.product_id, -1)}>−</Button>
                    <span className="w-5 text-center text-sm">{cart[item.product_id]}</span>
                  </>
                )}
                <Button size="sm" aria-label={`Add ${item.name}`} onClick={() => add(item.product_id, 1)}
                  style={{ backgroundColor: accent, color: accentText }}>+</Button>
              </div>
            ) : item.sold_out ? (
              <span className="flex-none rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">Sold out</span>
            ) : null}
          </div>
        ))}
      </main>

      {drop.phase === 'open' && cartLines.length > 0 && (
        <section className="mt-8 rounded-2xl border p-4">
          <div className="flex items-center justify-between text-sm">
            <span>Subtotal</span><span>{money(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Tax</span><span>{money(tax)}</span>
            </div>
          )}
          {drop.tips_enabled && step === 'menu' && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-gray-600">Tip</span>
              {[0, 0.1, 0.15, 0.2].map((pct) => (
                <button key={pct} type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${tipPct === pct ? 'border-gray-900 font-semibold' : 'border-gray-300'}`}
                  onClick={() => setTipPct(pct)}>
                  {pct === 0 ? 'None' : `${pct * 100}%`}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between font-semibold">
            <span>Total</span><span data-testid="total">{money(total)}</span>
          </div>

          {step === 'menu' ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="buyer-name">Name</Label>
                <Input id="buyer-name" value={buyer.name} onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))} />
                <Label htmlFor="buyer-email">Email</Label>
                <Input id="buyer-email" type="email" value={buyer.email} onChange={(e) => setBuyer((b) => ({ ...b, email: e.target.value }))} />
                <Label htmlFor="buyer-phone">Phone (optional)</Label>
                <Input id="buyer-phone" value={buyer.phone} onChange={(e) => setBuyer((b) => ({ ...b, phone: e.target.value }))} />
                <Label htmlFor="pickup-window">Pickup window</Label>
                <select id="pickup-window" className="rounded-md border px-3 py-2 text-sm"
                  value={windowId} onChange={(e) => { setWindowId(e.target.value); setSlot('') }}>
                  {drop.pickup.windows.map((w) => (
                    <option key={w.id} value={w.id}>{windowLabel(w)}</option>
                  ))}
                </select>
                {needsSlot && selectedWindow && (
                  <>
                    <Label htmlFor="pickup-slot">Pickup time</Label>
                    <select id="pickup-slot" className="rounded-md border px-3 py-2 text-sm"
                      value={slot} onChange={(e) => setSlot(e.target.value)}>
                      <option value="">Choose a time…</option>
                      {slotOptions(selectedWindow).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <Button className="w-full" disabled={!detailsComplete}
                style={{ backgroundColor: accent, color: accentText }}
                onClick={() => setStep('checkout')}>
                Check out
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              {/* key remounts the checkout (fresh intent) if the cart/tip changed */}
              <DropCheckout key={JSON.stringify(request)} request={request} total={total} />
              <button type="button" className="mt-3 text-xs text-gray-500 underline" onClick={() => setStep('menu')}>
                Back to menu
              </button>
            </div>
          )}
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-gray-400">
        <a href={`/p/${drop.org.handle}`} className="hover:text-gray-600">{drop.org.display_name}</a>
      </footer>
    </div>
  )
}
