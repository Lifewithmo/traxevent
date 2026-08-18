'use client'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DropStorefront } from '@/components/storefront/DropStorefront'
import type { PublicDrop } from '@/actions/storefront-public'

function sampleDrop(name: string): PublicDrop {
  const cart = name.trim() || 'Your Cart'
  return {
    id: 'preview',
    title: 'Friday Drop',
    note: 'Pre-order by Thursday night',
    phase: 'open',
    opens_at: '',
    closes_at: '',
    timezone: 'America/Boise',
    pickup: {
      location_name: 'Your market spot',
      address: 'Main Street Farmers Market',
      windows: [{ id: 'w1', day: '2026-08-21', start: '07:00', end: '11:00' }],
    },
    items: [
      { product_id: '1', name: 'Cold Brew Flight', price: 6, sold_out: false },
      { product_id: '2', name: 'Chilled Can Latte 4-pack', price: 18, sold_out: false },
      { product_id: '3', name: 'Weekday Drip', price: 4, sold_out: false },
    ],
    tips_enabled: true,
    tax_rate: 0,
    org: { display_name: cart, handle: 'your-cart', accent_color: '#78350f' },
  }
}

export function StorePreview({ defaultName = '' }: { defaultName?: string }) {
  const [name, setName] = useState(defaultName)
  return (
    <div>
      <div className="mb-4 max-w-sm">
        <Label htmlFor="cart-name">Your cart name</Label>
        <Input id="cart-name" placeholder="e.g. Love Brew" value={name}
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div data-testid="store-preview" className="rounded-xl ring-1 ring-foreground/10">
        <DropStorefront drop={sampleDrop(name)} />
      </div>
    </div>
  )
}
