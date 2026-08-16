'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Menu, MenuTrigger, MenuContent, MenuItem } from '@/components/ui/menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteLead, setLeadStage } from '@/actions/leads'
import { LEAD_STAGE_LABELS, OPEN_STAGES, opportunityTitle } from '@/lib/leads'
import { MarkLostDialog } from '@/components/admin/opportunity/MarkLostDialog'
import { MarkWaitingForm } from '@/components/admin/opportunity/MarkWaitingForm'
import { useCopyPortalLink } from '@/components/admin/opportunity/CopyPortalLinkButton'
import type { Lead, LeadStage } from '@/lib/types'

interface OpportunityActionsMenuProps {
  orgId: string
  orgSlug: string
  lead: Lead
  /** Won from here: the scheduler latch opens so the job can be created in one pass. */
  onWon: () => void
  /** A record-changing action settled; the page re-reads. */
  onDone: () => void
}

/**
 * Losing is deliberately NOT a stage move. It routes through MarkLostDialog so
 * a LostReason is captured — the whole point of the lost-reason breakdown on
 * the pipeline header. (Carried over verbatim from StageMenu.tsx:17-18, the
 * component this menu replaced.)
 */
const MENU_STAGES: LeadStage[] = [...OPEN_STAGES, 'closed_won']

/**
 * Every action that acts on the OPPORTUNITY, in one kit Menu.
 *
 * Replaces four hand-rolled `useRef` + outside-pointerdown popovers (StageMenu,
 * the delete overflow, MarkLostDialog's fake `role="dialog"`, and the
 * MarkWaitingForm popover orphaned inside the banner). Email/Call stay outside
 * as header buttons: they act on the CONTACT and are the two things an operator
 * reaches for without thinking. Everything else — including the destructive
 * pair — is subordinate, behind one trigger.
 */
export function OpportunityActionsMenu({ orgId, orgSlug, lead, onWon, onDone }: OpportunityActionsMenuProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [lostOpen, setLostOpen] = useState(false)
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const portal = useCopyPortalLink(orgId, lead.id)

  // Stage items keep the menu open on their own (closeOnClick={false}) so a
  // failed move can say why. A silent no-op behind a closed menu is how
  // operators end up believing a deal moved when it did not.
  async function move(stage: LeadStage) {
    setBusy(true); setError(null)
    try {
      await setLeadStage(orgId, lead.id, stage)
      setOpen(false)
      if (stage === 'closed_won') onWon()
      onDone()
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    try {
      await deleteLead(orgId, lead.id)
      router.push(`/${orgSlug}/leads`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setDeleting(false)
    }
  }

  function launch(openIt: (v: boolean) => void) {
    setError(null)
    setOpen(false)
    openIt(true)
  }

  return (
    <>
      {/* Opening is a fresh start. Both `error` and the portal hook's one-shot
          "Copied!" outlive the menu that produced them, so without this the
          next open reports on the last one: a stale failure the operator
          already dismissed, or a copy confirmation for a click made minutes
          ago — which also renames the item, putting "Copy portal link" out of
          reach of anyone (screen reader or test) looking for it by name. */}
      <Menu
        open={open}
        onOpenChange={(next) => {
          if (next) { setError(null); portal.reset() }
          setOpen(next)
        }}
      >
        <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
          <MoreHorizontal />
        </MenuTrigger>
        <MenuContent className="min-w-52">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
            Move to
          </p>
          {MENU_STAGES.map((stage) => (
            <MenuItem
              key={stage}
              closeOnClick={false}
              disabled={busy || stage === lead.stage}
              onClick={() => move(stage)}
            >
              {LEAD_STAGE_LABELS[stage]}
            </MenuItem>
          ))}

          <div role="presentation" className="my-1 h-px bg-border" />

          <MenuItem onClick={() => launch(setLostOpen)}>Mark lost…</MenuItem>
          <MenuItem onClick={() => launch(setWaitingOpen)}>Mark as waiting…</MenuItem>
          <MenuItem closeOnClick={false} disabled={portal.busy} onClick={() => void portal.copy()}>
            {portal.busy ? 'Generating…' : portal.copied ? 'Copied!' : 'Copy portal link'}
          </MenuItem>

          <div role="presentation" className="my-1 h-px bg-border" />

          <MenuItem className="text-destructive" onClick={() => launch(setDeleteOpen)}>
            Delete
          </MenuItem>

          {(error || portal.error) && (
            <p role="alert" className="px-2 py-1 text-xs text-destructive">
              {error ?? portal.error}
            </p>
          )}
        </MenuContent>
      </Menu>

      <MarkLostDialog
        orgId={orgId}
        leadId={lead.id}
        onDone={onDone}
        open={lostOpen}
        onOpenChange={setLostOpen}
      />
      <MarkWaitingForm orgId={orgId} leadId={lead.id} open={waitingOpen} onOpenChange={setWaitingOpen} />

      <Dialog open={deleteOpen} onOpenChange={(next) => { if (!deleting) setDeleteOpen(next) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this opportunity?</DialogTitle>
            {/* Says what `deleteLead` ACTUALLY does. It is one
                `leadsRef(orgId).doc(leadId).delete()` (actions/leads.ts:138-141)
                — there is no cascade anywhere in the repo. Tasks live in a
                subcollection (lib/crm/tasks.ts:4) and Firestore never deletes
                subcollections with their parent; proposals and invoices are
                TOP-LEVEL collections filtered by lead_id (lib/crm/invoices.ts:33),
                so they survive: still live, still sendable, still counted in AR.
                The earlier copy promised the cascade, which is how an operator
                deletes a lost lead carrying a $5,000 unpaid invoice believing
                the invoice went with it. Do not restore that claim without the
                server-side cascade to back it. */}
            <DialogDescription>
              “{opportunityTitle(lead)}” disappears from the pipeline. Proposals and invoices already created
              from it are NOT deleted — void them first if you want them gone. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
