'use client'

// Settings → Proposal templates: manage the org's template library.
// Editing happens in the template editor route; this list handles the
// lifecycle actions (create, rename, duplicate, delete).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusPill } from '@/components/ui/status-pill'
import {
  createProposalTemplate,
  renameProposalTemplate,
  duplicateProposalTemplate,
  deleteProposalTemplate,
} from '@/actions/proposal-templates'
import type { ProposalTemplate } from '@/lib/types'

export function TemplateListClient({
  orgId,
  orgSlug,
  templates,
}: {
  orgId: string
  orgSlug: string
  templates: ProposalTemplate[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  async function handleNew() {
    const name = window.prompt('Template name:')
    if (!name?.trim()) return
    setBusy('new')
    setError(null)
    try {
      const t = await createProposalTemplate(orgId, { name: name.trim() })
      router.push(`/${orgSlug}/proposal-templates/${t.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template')
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proposal templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable proposal documents — content, pricing, and terms. Pick one when creating a proposal.
          </p>
        </div>
        <Button onClick={handleNew} disabled={busy !== null}>New template</Button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            title="No templates yet"
            description="Build one from scratch, or open any proposal and choose “Save as template”."
            action={
              <Button variant="outline" size="sm" onClick={handleNew}>
                New template
              </Button>
            }
            className="py-10"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {templates.map((t) => {
            // Row-scoped: `busy` holds the id of the row whose action is in
            // flight, so one row's work never freezes the rest of the library.
            const rowBusy = busy === t.id
            const used = t.usage_count ?? 0
            return (
              <div
                key={t.id}
                data-testid={`template-row-${t.id}`}
                className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/${orgSlug}/proposal-templates/${t.id}`}
                    className="truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      t.description,
                      `${t.line_items.length} line item${t.line_items.length === 1 ? '' : 's'}`,
                      t.packages?.length ? `${t.packages.length} packages` : null,
                      t.updated_at ? `updated ${t.updated_at.slice(0, 10)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {used > 0 ? (
                  <StatusPill tone="confirmed">Used {used}×</StatusPill>
                ) : (
                  <StatusPill tone="neutral">Unused</StatusPill>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={rowBusy}
                    onClick={() => {
                      const name = window.prompt('Rename template:', t.name)
                      if (!name?.trim() || name.trim() === t.name) return
                      void run(t.id, () => renameProposalTemplate(orgId, t.id, name.trim()))
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={rowBusy}
                    onClick={() => void run(t.id, async () => { await duplicateProposalTemplate(orgId, t.id) })}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    disabled={rowBusy}
                    onClick={() => {
                      if (!window.confirm(`Delete “${t.name}”? Proposals already created from it are unaffected.`)) return
                      void run(t.id, () => deleteProposalTemplate(orgId, t.id))
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
