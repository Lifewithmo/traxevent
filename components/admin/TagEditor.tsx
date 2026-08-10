'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TagEditorProps {
  tags: string[]
  suggestions: string[]
  onSave: (next: string[]) => Promise<void>
}

export function TagEditor({ tags, suggestions, onSave }: TagEditorProps) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: string[]) {
    setBusy(true); setError(null)
    try { await onSave(next) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save tags') }
    finally { setBusy(false) }
  }

  async function add(tag: string) {
    const t = tag.trim()
    if (!t || tags.some((x) => x.toLowerCase() === t.toLowerCase())) { setDraft(''); return }
    setDraft('')
    await save([...tags, t])
  }

  const q = draft.trim().toLowerCase()
  const matches = q
    ? suggestions.filter(
        (s) => s.toLowerCase().includes(q) && !tags.some((t) => t.toLowerCase() === s.toLowerCase())
      ).slice(0, 6)
    : []

  return (
    <div className="mt-2 space-y-1">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              className="hover:text-destructive"
              disabled={busy}
              onClick={() => save(tags.filter((x) => x !== t))}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <div className="max-w-56 space-y-1">
        <Label htmlFor="addTag" className="sr-only">Add tag</Label>
        <Input
          id="addTag"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(draft) } }}
          placeholder="Add tag…"
          className="h-7 text-sm"
        />
        {matches.length > 0 && (
          <ul className="rounded-md border border-border divide-y">
            {matches.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="w-full px-2 py-1 text-left text-sm hover:bg-muted"
                  disabled={busy}
                  onClick={() => void add(s)}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
