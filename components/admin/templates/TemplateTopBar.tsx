'use client'

// Command bar for the template editor: back link, inline-editable template
// name, autosave state, delete. Deliberately none of the proposal TopBar's
// transactional surface (status badge, Send, client link, void, AI).
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { InlineText } from '@/components/admin/proposal-builder/InlineText'
import type { SaveStatus } from '@/components/admin/proposal-builder/useDraftAutosave'

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  dirty: 'Saving…',
  saving: 'Saving…',
  retrying: 'Retrying',
}

export function TemplateTopBar({
  orgSlug,
  name,
  onName,
  saveStatus,
  retryNow,
  onDelete,
  busy = false,
}: {
  orgSlug: string
  name: string
  onName: (next: string) => void
  saveStatus?: SaveStatus
  retryNow?: () => void
  onDelete?: () => void
  busy?: boolean
}) {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b bg-white/95 px-4 py-2 backdrop-blur">
      <Link
        href={`/${orgSlug}/proposal-templates`}
        className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Templates
      </Link>
      <div className="min-w-0 flex-1">
        <InlineText
          value={name}
          onCommit={onName}
          placeholder="Template name"
          className="w-full truncate text-base font-semibold"
          ariaLabel="Template name"
        />
      </div>
      {saveStatus && (
        <button
          type="button"
          onClick={saveStatus === 'retrying' ? retryNow : undefined}
          className={`shrink-0 text-xs ${saveStatus === 'retrying' ? 'text-destructive underline' : 'text-muted-foreground'}`}
        >
          {SAVE_LABELS[saveStatus]}
        </button>
      )}
      <Button variant="outline" size="sm" disabled={busy} onClick={onDelete}>
        Delete
      </Button>
    </header>
  )
}
