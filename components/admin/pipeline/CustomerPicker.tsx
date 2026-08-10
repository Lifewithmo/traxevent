'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Customer } from '@/lib/types'

interface CustomerPickerProps {
  customers: Customer[]
  value: Customer | null
  onChange: (customer: Customer | null) => void
}

export function CustomerPicker({ customers, value, onChange }: CustomerPickerProps) {
  const [query, setQuery] = useState('')

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span>
          Linked to <span className="font-medium">{value.name}</span>
          {value.company ? ` · ${value.company}` : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Clear</Button>
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const matches = q
    ? customers.filter((c) =>
        [c.name, c.company, c.email].some((f) => f?.toLowerCase().includes(q))
      ).slice(0, 8)
    : []

  return (
    <div className="space-y-1">
      <Label htmlFor="customerPicker">Link to existing customer (optional)</Label>
      <Input
        id="customerPicker"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients by name, company, or email"
      />
      {matches.length > 0 && (
        <ul className="rounded-md border border-border divide-y">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => { onChange(c); setQuery('') }}
              >
                {c.name}
                {c.company ? ` · ${c.company}` : ''}
                {c.email ? ` · ${c.email}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
