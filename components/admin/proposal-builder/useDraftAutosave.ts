'use client'

// Autosave state machine (spec §5): every edit lands in one consolidated
// draft, debounced ~800 ms into a single updateProposalDraft call. The client
// re-seeds from the server's persisted response ("never lie about what
// persisted"); a failed save parks in 'retrying' with the edits intact —
// nothing is thrown away client-side while the tab is open.
import { useCallback, useEffect, useRef, useState } from 'react'
import { updateProposalDraft } from '@/actions/proposals'
import { draftFromProposal, type ProposalDraftUpdate } from '@/lib/proposals/draft'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'retrying'

const DEBOUNCE_MS = 800

export function useDraftAutosave({
  orgId,
  proposalId,
  initial,
  enabled,
  initiallyDirty = false,
}: {
  orgId: string
  proposalId: string
  initial: ProposalDraftUpdate
  enabled: boolean
  initiallyDirty?: boolean
}) {
  const [draft, setDraft] = useState<ProposalDraftUpdate>(initial)
  // A locked proposal never autosaves, so the legacy upgrade computed at load
  // stays client-side only (opening read-only never writes).
  const [status, setStatus] = useState<SaveStatus>(enabled && initiallyDirty ? 'dirty' : 'saved')
  const [adjustments, setAdjustments] = useState<string[]>([])

  const draftRef = useRef(draft)
  draftRef.current = draft
  // Monotonic edit counter: a save response only re-seeds state if no newer
  // edit arrived while the request was in flight — otherwise the response
  // would clobber keystrokes typed during the round-trip.
  const versionRef = useRef(0)

  const update = useCallback(
    (patch: Partial<ProposalDraftUpdate>) => {
      if (!enabled) return
      versionRef.current += 1
      setDraft((d) => ({ ...d, ...patch }))
      setStatus('dirty')
    },
    [enabled],
  )

  useEffect(() => {
    if (!enabled || status !== 'dirty') return
    const version = versionRef.current
    const timer = setTimeout(async () => {
      setStatus('saving')
      try {
        const res = await updateProposalDraft(orgId, proposalId, draftRef.current)
        setAdjustments(res.adjustments)
        if (versionRef.current === version) {
          setDraft((d) => ({ ...d, ...draftFromProposal(res.proposal) }))
          setStatus('saved')
        } else {
          // Newer edits arrived mid-flight; leave them dirty so the effect
          // schedules another save with the newest draft.
          setStatus('dirty')
        }
      } catch {
        setStatus('retrying')
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, status, draft, orgId, proposalId])

  const retryNow = useCallback(() => setStatus('dirty'), [])

  return { draft, update, status, adjustments, retryNow }
}
