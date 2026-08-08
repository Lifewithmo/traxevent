'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OpportunityDetailsForm } from '@/components/admin/opportunity/OpportunityDetailsForm'
import type { Customer, Lead } from '@/lib/types'

interface FactsGridProps {
  orgId: string
  orgSlug: string
  lead: Lead
  customer: Customer | null
}

export function FactsGrid({ orgId, orgSlug, lead, customer }: FactsGridProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="space-y-2">
        <OpportunityDetailsForm orgId={orgId} orgSlug={orgSlug} lead={lead} customer={customer} />
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Done
        </Button>
      </div>
    )
  }

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Event date', value: lead.event_date ?? '—' },
    { label: 'Guest count', value: lead.guest_count != null ? `${lead.guest_count} (estimate)` : '—' },
    { label: 'Event type', value: lead.event_type ?? '—' },
    { label: 'Estimated value', value: lead.estimated_value != null ? `$${lead.estimated_value.toLocaleString()}` : '—' },
  ]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Details</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="text-sm font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
