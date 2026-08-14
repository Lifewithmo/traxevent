'use client'

// Settings → Proposal templates: manage the org's template library.
// Editing happens in the template editor route; this list handles the
// lifecycle actions (create, rename, duplicate, delete).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proposal templates</h1>
          <p className="text-sm text-muted-foreground">
            Reusable proposal documents — content, pricing, and terms. Pick one when creating a proposal.
          </p>
        </div>
        <Button onClick={handleNew} disabled={busy !== null}>New template</Button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No templates yet. Build one from scratch here, or open any proposal and choose
            “Save as template”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <Link
                    href={`/${orgSlug}/proposal-templates/${t.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[
                      t.description,
                      `${t.line_items.length} line item${t.line_items.length === 1 ? '' : 's'}`,
                      t.packages?.length ? `${t.packages.length} packages` : null,
                      `used ${t.usage_count ?? 0}×`,
                      t.updated_at ? `updated ${t.updated_at.slice(0, 10)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      const name = window.prompt('Rename template:', t.name)
                      if (!name?.trim() || name.trim() === t.name) return
                      void run(t.id, () => renameProposalTemplate(orgId, t.id, name.trim()))
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void run(t.id, async () => { await duplicateProposalTemplate(orgId, t.id) })}
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => {
                      if (!window.confirm(`Delete “${t.name}”? Proposals already created from it are unaffected.`)) return
                      void run(t.id, () => deleteProposalTemplate(orgId, t.id))
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
