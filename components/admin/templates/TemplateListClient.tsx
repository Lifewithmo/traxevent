'use client'

// Settings → Proposal templates: manage the org's template library.
// Editing happens in the template editor route; this list handles the
// lifecycle actions (create, rename, duplicate, delete).
import { useState, type ComponentProps } from 'react'
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

// Both entry points to "create" render through here so the in-flight guard
// can never drift apart: an unguarded second click during the create
// round-trip (auth + write) opens a second prompt and orphans a document,
// since only one of the two ids gets navigated to.
function NewTemplateButton({
  creating,
  onNew,
  variant,
  size,
}: {
  creating: boolean
  onNew: () => void
  variant?: ComponentProps<typeof Button>['variant']
  size?: ComponentProps<typeof Button>['size']
}) {
  return (
    <Button variant={variant} size={size} onClick={onNew} disabled={creating}>
      New template
    </Button>
  )
}

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
  // In-flight state is tracked per concern, never in one shared slot. A single
  // key multiplexing row ids and a 'new' sentinel let the concerns clear each
  // other — a finishing row would drop the create guard mid-flight, re-opening
  // the double-submit, and starting a create would un-gate an in-flight row.
  const [creating, setCreating] = useState(false)
  // A Set for the same reason one level down: rows run concurrently, so a
  // single id would let each new row's action clear the previous row's guard.
  const [rowBusy, setRowBusy] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function run(key: string, fn: () => Promise<void>) {
    setRowBusy((prev) => new Set(prev).add(key))
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setRowBusy((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  async function handleNew() {
    const name = window.prompt('Template name:')
    if (!name?.trim()) return
    setCreating(true)
    setError(null)
    try {
      const t = await createProposalTemplate(orgId, { name: name.trim() })
      router.push(`/${orgSlug}/proposal-templates/${t.id}`)
      // Deliberately no `finally`: the guard has to survive the push, which
      // navigates away and unmounts us. Clearing it here would re-enable the
      // button for the whole duration of the navigation.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template')
      setCreating(false)
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
        {/* Only the create action gates this button — row work must not freeze it. */}
        <NewTemplateButton creating={creating} onNew={handleNew} />
      </div>

      {/* Kept mounted so the live region can announce, but collapsed out of
          flow while empty — otherwise it eats a second `space-y-4` gap. */}
      <div aria-live="polite" aria-atomic="true" className={error ? undefined : 'sr-only'}>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            title="No templates yet"
            description="Build one from scratch, or open any proposal and choose “Save as template”."
            action={<NewTemplateButton creating={creating} onNew={handleNew} variant="outline" size="sm" />}
            className="py-10"
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {templates.map((t) => {
            // Row-scoped: rowBusy holds the ids of rows whose actions are in
            // flight, so one row's work never freezes the rest of the library.
            const isRowBusy = rowBusy.has(t.id)
            const used = t.usage_count ?? 0
            return (
              <div
                key={t.id}
                data-testid={`template-row-${t.id}`}
                className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
              >
                {/* `basis-48` gives the name a real hypothetical width so the
                    actions wrap below it on narrow viewports instead of
                    squeezing the primary content toward zero. */}
                <div className="min-w-0 grow basis-48">
                  {/* `block` is load-bearing: overflow/text-overflow do not
                      apply to the inline box `next/link` renders, so a bare
                      `truncate` here would clip with no ellipsis. */}
                  <Link
                    href={`/${orgSlug}/proposal-templates/${t.id}`}
                    className="block truncate text-sm font-medium underline-offset-4 hover:underline"
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
                <span className="shrink-0">
                  {used > 0 ? (
                    <StatusPill tone="confirmed">Used {used}×</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Unused</StatusPill>
                  )}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={isRowBusy}
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
                    disabled={isRowBusy}
                    onClick={() => void run(t.id, async () => { await duplicateProposalTemplate(orgId, t.id) })}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    // `hover:` too — the ghost variant ships `hover:text-foreground`,
                    // which otherwise drains the red exactly as the pointer lands.
                    className="text-destructive hover:text-destructive"
                    disabled={isRowBusy}
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
