'use client'

import { useState } from 'react'
import { DropsTab } from '@/components/admin/storefront/DropsTab'
import { ProductsTab } from '@/components/admin/storefront/ProductsTab'
import type { Drop, Product } from '@/lib/types'

type Tab = 'drops' | 'products'

export interface DropStats { count: number; revenue: number }

interface StorefrontClientProps {
  orgId: string
  orgSlug: string
  isAdmin: boolean
  title: string
  drops: Drop[]
  stats: Record<string, DropStats>
  products: Product[]
}

export function StorefrontClient({ orgId, orgSlug, isAdmin, title, drops, stats, products }: StorefrontClientProps) {
  const [tab, setTab] = useState<Tab>('drops')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'drops', label: title },
    { id: 'products', label: 'Products' },
  ]
  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>
      <div className="flex gap-1 border-b mb-6" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'drops' && <DropsTab orgSlug={orgSlug} drops={drops} stats={stats} isAdmin={isAdmin} />}
      {tab === 'products' && <ProductsTab orgId={orgId} products={products} isAdmin={isAdmin} />}
    </div>
  )
}
