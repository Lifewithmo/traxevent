'use client'

// Full-screen skeleton picker for "New proposal" (spec §3): three themed
// thumbnail cards + Blank. Picking creates the proposal with the CRM-
// autofilled title, scaffolds the skeleton's placeholder blocks (intro
// pre-addressed to the lead contact), and enters the builder.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProposal } from '@/actions/proposals'
import { updateProposalDraft } from '@/actions/proposal-builder-stubs'
import { PROPOSAL_SKELETONS, type SkeletonKey } from '@/lib/proposals/skeletons'

// Miniature "thumbnail" strokes suggesting each skeleton's shape.
const THUMBS: Record<SkeletonKey, string[]> = {
  full: ['title', 'text', 'head', 'text', 'image', 'tiers'],
  quick: ['title', 'text', 'tiers'],
  visual: ['title', 'image', 'text', 'image', 'quote'],
  blank: [],
}

function ThumbRow({ kind }: { kind: string }) {
  switch (kind) {
    case 'title': return <div className="h-2 w-2/3 rounded bg-gray-800" />
    case 'head': return <div className="h-1.5 w-1/2 rounded bg-gray-600" />
    case 'text': return <div className="h-1 w-full rounded bg-gray-300" />
    case 'image': return <div className="h-6 w-full rounded bg-gray-200" />
    case 'quote': return <div className="ml-2 h-1.5 w-3/4 rounded border-l-2 border-gray-400 bg-gray-200" />
    case 'tiers':
      return (
        <div className="flex gap-1">
          <div className="h-5 flex-1 rounded bg-gray-200" />
          <div className="h-5 flex-1 rounded bg-gray-300" />
          <div className="h-5 flex-1 rounded bg-gray-200" />
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
}: {
  orgId: string
  orgSlug: string
  leadId: string
  title: string
  contactName?: string
}) {
  const router = useRouter()
  const [creating, setCreating] = useState<SkeletonKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(key: SkeletonKey) {
    setCreating(key)
    setError(null)
    try {
      const created = await createProposal(orgId, leadId, { title })
      const blocks = PROPOSAL_SKELETONS.find((s) => s.key === key)!.makeBlocks({ contactName })
      if (blocks.length > 0) {
        await updateProposalDraft(orgId, created.id, { blocks })
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PROPOSAL_SKELETONS.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={creating !== null}
            onClick={() => pick(s.key)}
            className="flex flex-col rounded-lg border border-gray-200 p-4 text-left transition hover:border-gray-400 hover:shadow-sm disabled:opacity-50"
          >
            <div className="mb-3 flex h-28 w-full flex-col justify-start gap-1.5 rounded border border-gray-100 bg-gray-50 p-3">
              {THUMBS[s.key].map((kind, i) => <ThumbRow key={i} kind={kind} />)}
              {s.key === 'blank' && (
                <span className="m-auto text-2xl text-gray-300">+</span>
              )}
            </div>
            <span className="font-medium">{creating === s.key ? 'Creating…' : s.name}</span>
            <span className="mt-1 text-xs text-muted-foreground">{s.description}</span>
          </button>
        ))}
      </div>
    </main>
  )
}
