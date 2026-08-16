'use client'

// Full-screen picker for "New proposal" (spec §3 + templates spec
// 2026-08-13 §7): the org's own templates first (when any exist), then the
// built-in skeletons. Picking creates the proposal with the CRM-autofilled
// title, applies the template content or scaffolds the skeleton's
// placeholder blocks, and enters the builder.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProposal, updateProposalDraft } from '@/actions/proposals'
import { createProposalFromTemplate } from '@/actions/proposal-templates'
import { PROPOSAL_SKELETONS, type SkeletonKey } from '@/lib/proposals/skeletons'
import type { ProposalTemplate } from '@/lib/types'

// Miniature "thumbnail" strokes suggesting each skeleton's shape. The warm-*
// steps are a deliberate contrast ladder (800 → 200) that keeps the wireframe
// legible; collapsing them onto bg-muted/bg-border would flatten it.
//
// COLOUR RULE — the thumbnail is a miniature of the proposal's fixed-white
// paper, so its panel is pinned to the same fixed --warm-* ramp as the strokes
// it contains. A theme-aware panel (bg-muted) under fixed strokes inverts the
// ladder in dark mode — dark strokes on a dark panel — and the wireframe reads
// as noise. The card chrome around it is app UI and stays theme-aware.
const THUMBS: Record<SkeletonKey, string[]> = {
  full: ['title', 'text', 'head', 'text', 'image', 'tiers'],
  quick: ['title', 'text', 'tiers'],
  visual: ['title', 'image', 'text', 'image', 'quote'],
  blank: [],
}

function ThumbRow({ kind }: { kind: string }) {
  switch (kind) {
    case 'title': return <div className="h-2 w-2/3 rounded bg-[var(--warm-800)]" />
    case 'head': return <div className="h-1.5 w-1/2 rounded bg-[var(--warm-600)]" />
    case 'text': return <div className="h-1 w-full rounded bg-[var(--warm-300)]" />
    case 'image': return <div className="h-6 w-full rounded bg-[var(--warm-200)]" />
    case 'quote': return <div className="ml-2 h-1.5 w-3/4 rounded border-l-2 border-[var(--warm-400)] bg-[var(--warm-200)]" />
    case 'tiers':
      return (
        <div className="flex gap-1">
          <div className="h-5 flex-1 rounded bg-[var(--warm-200)]" />
          <div className="h-5 flex-1 rounded bg-[var(--warm-300)]" />
          <div className="h-5 flex-1 rounded bg-[var(--warm-200)]" />
        </div>
      )
    default: return null
  }
}

export function SkeletonPicker({
  orgId,
  orgSlug,
  leadId,
  title,
  contactName,
  templates = [],
}: {
  orgId: string
  orgSlug: string
  leadId: string
  title: string
  contactName?: string
  templates?: ProposalTemplate[]
}) {
  const router = useRouter()
  const [creating, setCreating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pickTemplate(t: ProposalTemplate) {
    setCreating(`tpl:${t.id}`)
    setError(null)
    try {
      const created = await createProposalFromTemplate(orgId, leadId, t.id, { title })
      router.push(`/${orgSlug}/leads/${leadId}/proposals/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create proposal')
      setCreating(null)
    }
  }

  async function pick(key: SkeletonKey) {
    setCreating(key)
    setError(null)
    try {
      const created = await createProposal(orgId, leadId, { title })
      const blocks = PROPOSAL_SKELETONS.find((s) => s.key === key)!.makeBlocks({ contactName })
      if (blocks.length > 0) {
        // updateProposalDraft is FULL-state (absent field = cleared): omitting
        // `title` here would delete the title createProposal just set.
        await updateProposalDraft(orgId, created.id, { title, blocks })
      }
      router.push(`/${orgSlug}/leads/${leadId}/proposals/${created.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create proposal')
      setCreating(null)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-bold">New proposal</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Start from a skeleton — placeholder sections guide the writing and the AI can fill them from your notes.
      </p>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      </div>
      {templates.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your templates
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={creating !== null}
                onClick={() => pickTemplate(t)}
                className="flex flex-col rounded-lg border border-border p-4 text-left transition hover:border-ring hover:shadow-sm disabled:opacity-50"
              >
                <span className="font-medium">
                  {creating === `tpl:${t.id}` ? 'Creating…' : t.name}
                </span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {t.description ||
                    [
                      `${t.line_items.length} line item${t.line_items.length === 1 ? '' : 's'}`,
                      t.packages?.length ? `${t.packages.length} packages` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {templates.length > 0 && (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Start fresh
        </h2>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROPOSAL_SKELETONS.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={creating !== null}
            onClick={() => pick(s.key)}
            className="flex flex-col rounded-lg border border-border p-4 text-left transition hover:border-ring hover:shadow-sm disabled:opacity-50"
          >
            <div className="mb-3 flex h-28 w-full flex-col justify-start gap-1.5 rounded border border-[var(--warm-200)] bg-[var(--warm-50)] p-3">
              {THUMBS[s.key].map((kind, i) => <ThumbRow key={i} kind={kind} />)}
              {s.key === 'blank' && (
                <span className="m-auto text-2xl text-[var(--warm-300)]">+</span>
              )}
            </div>
            <span className="font-medium">{creating === s.key ? 'Creating…' : s.name}</span>
            <span className="mt-1 text-xs text-muted-foreground">{s.description}</span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Reuse your best work — manage reusable documents under{' '}
        <a href={`/${orgSlug}/proposal-templates`} className="underline underline-offset-4">
          Settings → Proposal templates
        </a>
        .
      </p>
    </main>
  )
}
