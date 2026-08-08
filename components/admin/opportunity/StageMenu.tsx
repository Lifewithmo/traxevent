'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setLeadStage } from '@/actions/leads'
import { LEAD_STAGE_LABELS, OPEN_STAGES } from '@/lib/leads'
import type { Lead, LeadStage } from '@/lib/types'

interface StageMenuProps {
  orgId: string
  lead: Lead
  onWon: () => void
}

// Losing is not offered here — it goes through MarkLostDialog so a reason is captured.
const MENU_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

export function StageMenu({ orgId, lead, onWon }: StageMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move(stage: LeadStage) {
    setBusy(true); setError(null)
    try {
      await setLeadStage(orgId, lead.id, stage)
      setOpen(false)
      if (stage === 'closed_won') onWon()
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Move stage
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Move stage"
          className="absolute right-0 z-10 mt-1 w-44 space-y-0.5 rounded-md border bg-background p-1 shadow-md"
        >
          {MENU_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              role="menuitem"
              disabled={busy || stage === lead.stage}
              onClick={() => move(stage)}
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              {LEAD_STAGE_LABELS[stage]}
            </button>
          ))}
          {error && <p className="px-2 py-1 text-sm text-destructive" role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
