'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Household } from '@/lib/households'

function downloadCsv(households: Household[]) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const header = 'Name,Email,Phone,Events,Most recent event'
  const lines = households.map((h) =>
    [esc(h.name), esc(h.email), esc(h.phone), h.event_count, esc(h.events[0]?.camp_name ?? '')].join(',')
  )
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'org-registrants.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function RegistrantsClient({ households }: { households: Household[] }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return households
    return households.filter((h) => h.name.toLowerCase().includes(needle) || h.email.toLowerCase().includes(needle))
  }, [households, q])

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Registrants</h1>
        <Button variant="outline" size="sm" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>Export CSV</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Everyone who has registered for any of your events, deduplicated by email. {households.length} household{households.length !== 1 ? 's' : ''}.
      </p>
      <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="bg-card rounded-lg border divide-y">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No registrants{q ? ' match your search' : ' yet'}.</p>
        ) : (
          filtered.map((h) => (
            <div key={h.email}>
              <button
                type="button"
                onClick={() => setOpen(open === h.email ? null : h.email)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50"
                aria-expanded={open === h.email}
              >
                <div>
                  <p className="font-medium">{h.name || h.email}</p>
                  <p className="text-xs text-muted-foreground">{h.email}{h.phone ? ` · ${h.phone}` : ''}</p>
                </div>
                <Badge variant="outline">{h.event_count} event{h.event_count !== 1 ? 's' : ''}</Badge>
              </button>
              {open === h.email && (
                <ul className="px-4 pb-3 space-y-1">
                  {h.events.map((ev, i) => (
                    <li key={`${ev.camp_id}-${i}`} className="flex items-center justify-between text-sm">
                      <span>{ev.camp_name} <span className="text-muted-foreground">({ev.year})</span></span>
                      <span className="flex gap-1">
                        <Badge variant="secondary" className="capitalize">{ev.registration_status}</Badge>
                        <Badge variant="outline" className="capitalize">{ev.payment_status}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
