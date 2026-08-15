'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProduct, updateProduct, uploadProductPhoto } from '@/actions/products'
import type { Product } from '@/lib/types'

interface Draft { id?: string; name: string; price: string; description: string; photo_url?: string }
const EMPTY: Draft = { name: '', price: '', description: '' }

export function ProductsTab({ orgId, products: initial, isAdmin }: { orgId: string; products: Product[]; isAdmin: boolean }) {
  const [products, setProducts] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePhoto(file: File | undefined) {
    if (!file || !draft) return
    const fd = new FormData()
    fd.set('file', file)
    try {
      const { url } = await uploadProductPhoto(orgId, fd)
      setDraft((d) => d && { ...d, photo_url: url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleSave() {
    if (!draft || !draft.name.trim() || !(Number(draft.price) > 0)) return
    setSaving(true)
    setError(null)
    try {
      if (draft.id) {
        const updates = {
          name: draft.name.trim(),
          price: Number(draft.price),
          description: draft.description.trim() ? draft.description.trim() : null,
          photo_url: draft.photo_url ?? null,
        }
        await updateProduct(orgId, draft.id, updates)
        setProducts((prev) => prev.map((p) => (p.id === draft.id
          ? { ...p, name: updates.name, price: updates.price,
              ...(updates.description ? { description: updates.description } : { description: undefined }),
              ...(updates.photo_url ? { photo_url: updates.photo_url } : { photo_url: undefined }) }
          : p)))
      } else {
        const created = await createProduct(orgId, {
          name: draft.name.trim(),
          price: Number(draft.price),
          ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
          ...(draft.photo_url ? { photo_url: draft.photo_url } : {}),
        })
        setProducts((prev) => [...prev, created])
      }
      setDraft(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Product) {
    await updateProduct(orgId, p.id, { active: !p.active })
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)))
  }

  return (
    <div>
      {isAdmin && !draft && (
        <Button className="mb-4" onClick={() => setDraft(EMPTY)}>New product</Button>
      )}
      {draft && (
        <div className="mb-6 grid max-w-md gap-2 rounded-xl border bg-white p-4">
          <Label htmlFor="product-name">Name</Label>
          <Input id="product-name" value={draft.name} onChange={(e) => setDraft((d) => d && { ...d, name: e.target.value })} />
          <Label htmlFor="product-price">Price</Label>
          <Input id="product-price" type="number" step="0.25" min="0" value={draft.price}
            onChange={(e) => setDraft((d) => d && { ...d, price: e.target.value })} />
          <Label htmlFor="product-description">Description</Label>
          <Input id="product-description" value={draft.description}
            onChange={(e) => setDraft((d) => d && { ...d, description: e.target.value })} />
          <Label htmlFor="product-photo">Photo</Label>
          <input id="product-photo" type="file" accept="image/*" className="text-sm"
            onChange={(e) => handlePhoto(e.target.files?.[0])} />
          {draft.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.photo_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button onClick={handleSave} disabled={saving}>Save</Button>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className={`rounded-xl border bg-white p-3 ${p.active ? '' : 'opacity-60'}`}>
            {p.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.photo_url} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
            )}
            <p className="font-semibold">{p.name}</p>
            <p className="text-sm text-gray-600">${p.price.toFixed(2)}</p>
            {!p.active && <p className="text-xs text-gray-400">Archived</p>}
            {isAdmin && (
              <div className="mt-2 flex gap-2 text-xs">
                <button className="underline" onClick={() => setDraft({ id: p.id, name: p.name, price: String(p.price), description: p.description ?? '', photo_url: p.photo_url })}>
                  Edit
                </button>
                <button className="underline" onClick={() => toggleActive(p)}>
                  {p.active ? 'Archive' : 'Restore'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
