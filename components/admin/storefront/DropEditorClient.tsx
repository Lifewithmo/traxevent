'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createDrop, updateDraftDrop, publishDrop, closeDrop, adjustDropStock } from '@/actions/drops'
import type { CreateDropInput } from '@/lib/storefront/drops'
import type { Drop, DropChannel, Product } from '@/lib/types'

const CHANNELS: Array<{ id: DropChannel; label: string; live: boolean }> = [
  { id: 'email', label: 'Email subscribers', live: true },
  { id: 'sms', label: 'SMS (coming soon)', live: false },
  { id: 'instagram', label: 'Instagram (share kit)', live: false },
  { id: 'facebook', label: 'Facebook (share kit)', live: false },
  { id: 'tiktok', label: 'TikTok (share kit)', live: false },
]

interface WindowDraft { day: string; start: string; end: string; slot_minutes: string }
interface ItemDraft { product_id: string; stock: string }

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DropEditorClient({
  orgId, orgSlug, products, drop, orgHasStripe, handle, tipsEnabled,
}: {
  orgId: string
  orgSlug: string
  products: Product[]
  drop: Drop | null
  orgHasStripe: boolean
  handle?: string
  tipsEnabled: boolean
}) {
  const router = useRouter()
  const isDraft = !drop || drop.status === 'draft'
  const [title, setTitle] = useState(drop?.title ?? '')
  const [note, setNote] = useState(drop?.note ?? '')
  const [opensAt, setOpensAt] = useState(drop ? toLocalInput(drop.opens_at) : '')
  const [closesAt, setClosesAt] = useState(drop ? toLocalInput(drop.closes_at) : '')
  const [location, setLocation] = useState(drop?.pickup.location_name ?? '')
  const [address, setAddress] = useState(drop?.pickup.address ?? '')
  const [windows, setWindows] = useState<WindowDraft[]>(
    drop?.pickup.windows.map((w) => ({ day: w.day, start: w.start, end: w.end, slot_minutes: w.slot_minutes ? String(w.slot_minutes) : '' })) ??
    [{ day: '', start: '08:00', end: '11:00', slot_minutes: '' }],
  )
  const [items, setItems] = useState<ItemDraft[]>(
    drop?.items.map((i) => ({ product_id: i.product_id, stock: i.stock !== undefined ? String(i.stock) : '' })) ?? [],
  )
  const [taxRate, setTaxRate] = useState(drop?.tax_rate !== undefined ? String(drop.tax_rate) : '')
  const [channels, setChannels] = useState<DropChannel[]>(drop?.channels ?? ['email'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Origin is read post-mount only — `window` doesn't exist during the
  // server render pass ('use client' components still render on the
  // server first), so reading it inline would crash there. Resolving it
  // in an effect mirrors the house pattern (see PublicProfileClient).
  const [origin, setOrigin] = useState('')
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const activeProducts = products.filter((p) => p.active)
  const publicUrl = handle && drop && origin ? `${origin}/p/${handle}/drops/${drop.id}` : null
  const shareText = drop
    ? `${title} — orders open soon! ☕ Order ahead: ${publicUrl ?? ''}`
    : ''

  function buildInput(): CreateDropInput {
    return {
      title,
      ...(note.trim() ? { note } : {}),
      opens_at: new Date(opensAt).toISOString(),
      closes_at: new Date(closesAt).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      pickup: {
        location_name: location,
        ...(address.trim() ? { address } : {}),
        windows: windows.map((w) => ({
          day: w.day, start: w.start, end: w.end,
          ...(w.slot_minutes !== '' ? { slot_minutes: Number(w.slot_minutes) } : {}),
        })),
      },
      items: items.map((i) => ({
        product_id: i.product_id,
        ...(i.stock !== '' ? { stock: Number(i.stock) } : {}),
      })),
      ...(taxRate !== '' ? { tax_rate: Number(taxRate) } : {}),
      channels,
    }
  }

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      after?.()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    await run(async () => {
      if (drop) await updateDraftDrop(orgId, drop.id, buildInput())
      else {
        const created = await createDrop(orgId, buildInput())
        router.push(`/${orgSlug}/drops/${created.id}`)
      }
    })
  }

  return (
    <div className="max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-bold">{drop ? title || 'Drop' : 'New drop'}</h1>
      {!orgHasStripe && (
        <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Connect Stripe (Settings → Billing) before this drop can be published.
        </p>
      )}
      {!handle && (
        <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          Enable your public profile (Settings → Public profile) — the drop page lives under it.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-600" aria-live="polite">{error}</p>}

      {isDraft ? (
        <div className="grid gap-3">
          <Label htmlFor="drop-title">Title</Label>
          <Input id="drop-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Label htmlFor="drop-note">Note to customers</Label>
          <Input id="drop-note" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="drop-opens">Orders open</Label>
              <Input id="drop-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="drop-closes">Orders close</Label>
              <Input id="drop-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>

          <h2 className="mt-3 font-semibold">Pickup</h2>
          <Label htmlFor="drop-location">Location name</Label>
          <Input id="drop-location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Label htmlFor="drop-address">Address (optional)</Label>
          <Input id="drop-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          {windows.map((w, i) => (
            <div key={i} className="grid grid-cols-4 items-end gap-2">
              <div>
                <Label>Day</Label>
                <Input type="date" value={w.day} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} />
              </div>
              <div>
                <Label>Start</Label>
                <Input type="time" value={w.start} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={w.end} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
              </div>
              <div>
                <Label>Slot mins (optional)</Label>
                <Input type="number" min="5" value={w.slot_minutes} onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, slot_minutes: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <button type="button" className="w-fit text-sm underline" onClick={() => setWindows((ws) => [...ws, { day: '', start: '08:00', end: '11:00', slot_minutes: '' }])}>
            + Add pickup window
          </button>

          <h2 className="mt-3 font-semibold">Menu</h2>
          {activeProducts.length === 0 && (
            <p className="text-sm text-gray-500">No active products yet — add some on the Products tab first.</p>
          )}
          {activeProducts.map((p) => {
            const sel = items.find((i) => i.product_id === p.id)
            return (
              <div key={p.id} className="flex items-center gap-3">
                <input
                  id={`item-${p.id}`} type="checkbox" checked={!!sel}
                  onChange={(e) =>
                    setItems((prev) => (e.target.checked ? [...prev, { product_id: p.id, stock: '' }] : prev.filter((i) => i.product_id !== p.id)))
                  }
                />
                <label htmlFor={`item-${p.id}`} className="flex-1 text-sm">{p.name} — ${p.price.toFixed(2)}</label>
                {sel && (
                  <Input
                    className="w-28" type="number" min="0" placeholder="Stock (∞)"
                    value={sel.stock}
                    onChange={(e) => setItems((prev) => prev.map((i) => (i.product_id === p.id ? { ...i, stock: e.target.value } : i)))}
                  />
                )}
              </div>
            )
          })}

          <Label htmlFor="drop-tax">Tax rate % (optional{tipsEnabled ? ' · tips are collected at checkout' : ''})</Label>
          <Input id="drop-tax" className="w-28" type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />

          <h2 className="mt-3 font-semibold">Announce on</h2>
          {CHANNELS.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <input
                id={`ch-${c.id}`} type="checkbox" checked={channels.includes(c.id)}
                onChange={(e) => setChannels((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))}
              />
              <label htmlFor={`ch-${c.id}`} className={c.live ? '' : 'text-gray-500'}>{c.label}</label>
            </div>
          ))}

          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={busy}>{drop ? 'Save draft' : 'Create draft'}</Button>
            {drop && (
              <Button
                disabled={busy || !orgHasStripe || !handle}
                onClick={() => run(() => publishDrop(orgId, drop.id))}
              >
                Publish{channels.includes('email') ? ' & announce' : ''}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-gray-600">
            Published. Items, prices, and windows are locked — you can adjust stock, close sales early, or share the link.
          </p>
          {publicUrl && (
            <div className="rounded-xl border p-4">
              <h2 className="font-semibold">Share kit</h2>
              <p className="mt-1 break-all text-sm text-gray-600">{publicUrl}</p>
              <p className="mt-2 rounded-md bg-gray-50 p-2 text-sm">{shareText}</p>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy link</Button>
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(shareText)}>Copy post</Button>
              </div>
            </div>
          )}
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold">Stock</h2>
            {drop!.items.map((i) => (
              <div key={i.product_id} className="mt-2 flex items-center gap-3 text-sm">
                <span className="flex-1">{i.name}</span>
                <Input
                  className="w-28" type="number" min="0" placeholder="∞"
                  defaultValue={i.stock !== undefined ? String(i.stock) : ''}
                  onBlur={(e) =>
                    run(() => adjustDropStock(orgId, drop!.id, i.product_id, e.target.value === '' ? null : Number(e.target.value)))
                  }
                />
              </div>
            ))}
          </div>
          {drop!.status === 'scheduled' && (
            <Button variant="outline" disabled={busy} onClick={() => run(() => closeDrop(orgId, drop!.id))}>
              Close sales now
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
