'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRightIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createLead, type CreateLeadInput } from '@/actions/leads'
import { validateLeadFields, type LeadFieldErrors } from '@/lib/crm/validate'
import { bookability, shortDayLabel, type BookabilityCtx } from '@/lib/calendar-bookability'
import { BookabilityBanner } from '@/components/admin/calendar/BookabilityBanner'
import { isValidYmd, todayYmd } from '@/lib/opportunity-detail'
import { activeEventTypeProfiles } from '@/lib/crm/event-type-options'
import { kindLabel } from '@/lib/capacity/labels'
import { cn } from '@/lib/utils'
import { CustomerPicker } from './CustomerPicker'
import { EventTypeSelect } from '@/components/admin/opportunity/EventTypeSelect'
import { NewEventTypePopover } from './NewEventTypePopover'
import { CallerMatchHint } from './CallerMatchHint'
import { FollowUpField, defaultFollowUpYmd } from './FollowUpField'
import { DeliveryModeToggle, type DeliveryMode } from './DeliveryModeToggle'
import type { Customer, EventTypeProfile, Lead, Org } from '@/lib/types'

interface NewOpportunityFormProps {
  orgId: string
  orgSlug: string
  open: boolean
  onClose: () => void
  customer?: Customer                 // cockpit: pinned; hides Who section's picker+contact fields
  customers?: Customer[]              // pipeline: picker + caller recognition
  // Business-tier org with a room to host in: offer the offsite / on-site
  // delivery toggle (default offsite). The server decides this — nothing to
  // choose for an org with no venue, so the control simply does not render.
  showDeliveryMode?: boolean
  // The org's event-type profiles (event types inc 1) — the ONE dropdown's
  // option list (the shared EventTypeSelect, same control as the intake form
  // and the opportunity editors — the chip-row-over-an-input combo is gone:
  // "IT LOOKS AND ACTS LIKE A TAG"). Only ACTIVE-profile membership decides
  // what the capacity engine does with a typed type (leadRequirement), so
  // this list alone drives the options, the "not a configured event type"
  // hint, the delivery-mode hiding, AND the `event_type_id` the create
  // payload carries on a name match. Archived entries are ignored here (the
  // form filters), so callers may thread the org array verbatim.
  eventTypeProfiles?: EventTypeProfile[]
  // Owner/admin (computed server-side from the member role): offers the
  // "+ New event type…" option in the dropdown (a zero-state button when the
  // org has no profiles yet) and the hint's "Add as event type" action —
  // decision (b), never leave the flow. Absent/false ⇒ none of them render.
  canCreateEventTypes?: boolean
  // The operator's kind vocabulary for the popover's policy toggles
  // ("needs cart" / "needs room" in THEIR words via `kindLabel`). Absent ⇒
  // the neutral platform defaults.
  resourceLabels?: Org['resource_labels']
  // customer_id -> that customer's total opportunity count, for the caller-
  // recognition card's "· {n} past jobs" segment (contract C5b).
  pastJobCounts?: Record<string, number>
  bookabilityCtx?: BookabilityCtx | null          // pipeline: preloaded at page render
  loadBookabilityCtx?: () => Promise<BookabilityCtx | null>  // cockpit: lazy, called once on first open
  initialValues?: { event_type?: string; guest_count?: number }  // cockpit: prefill from last job
  /** Fires after each successful create; `stayedOpen` is true on the
   *  save-and-create-another path, where the form announces the create in its
   *  own live region and the call site must NOT also raise the CreatedToast
   *  (contract C5b). The row-highlight id is recorded either way. */
  onCreated?: (lead: Lead, info: { stayedOpen: boolean }) => void
}

type FieldKey = keyof LeadFieldErrors

/** Focus lands on the FIRST invalid field in task-flow (visual) order — not
 *  the validator's historical intake order, which front-loads email. */
const FOCUS_ORDER: readonly FieldKey[] = [
  'name', 'phone', 'event_type', 'event_date', 'guest_count',
  'email', 'estimated_value', 'notes',
]

/** Fields that live inside the More-details disclosure: an error there must
 *  reopen the disclosure before focus can land. */
const MORE_FIELDS: ReadonlySet<FieldKey> = new Set(['email', 'estimated_value', 'notes'])

const digitsOf = (s: string) => s.replace(/\D/g, '')

/** The error line under a field. Renders nothing when the field is clean so
 *  `aria-describedby` never points at an empty node. */
function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null
  return (
    <p id={id} className="text-xs font-medium text-destructive">
      {children}
    </p>
  )
}

function SectionLegend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-muted-foreground">
      {children}
    </legend>
  )
}

/**
 * The New-opportunity dialog — the moment the business answers the caller.
 *
 * Task-flow order, not schema order (spec §6): WHO (name/phone + caller
 * recognition + client search fallback), WHAT & WHEN (the event-type
 * dropdown, date + guests with the LIVE bookability verdict rendered at the
 * date field), NEXT
 * (a follow-up that becomes a real task in the same server write), and a
 * More-details disclosure for the long tail (title/org/email/value/notes).
 *
 * The form OWNS its kit Dialog (contract C5) — call sites stop wrapping it —
 * with a sticky footer so Create is visible at 375×812 while the core fields
 * are on screen. The verdict INFORMS, never gates: Save stays live on a
 * `closed` day, and validation happens on submit with per-field errors rather
 * than a disabled button the operator has to reverse-engineer.
 */
export function NewOpportunityForm({
  orgId,
  orgSlug,
  open,
  onClose,
  customer,
  customers,
  showDeliveryMode,
  eventTypeProfiles,
  canCreateEventTypes,
  resourceLabels,
  pastJobCounts,
  bookabilityCtx,
  loadBookabilityCtx,
  initialValues,
  onCreated,
}: NewOpportunityFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  // The create-another announcement: the dialog stays open, so the top live
  // region — not the call site's CreatedToast — must say the record now
  // exists (contract C5b).
  const [announce, setAnnounce] = useState<string | null>(null)
  const [errors, setErrors] = useState<LeadFieldErrors>({})
  const [picked, setPicked] = useState<Customer | null>(null)
  // Caller recognition remembers "No, new client" per customer for the life of
  // one open — a father and son sharing a landline must not re-trigger the
  // hint on every keystroke after the operator has already answered it.
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const linked = customer ?? picked

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [organization, setOrganization] = useState('')
  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState(initialValues?.event_type ?? '')
  const [eventDate, setEventDate] = useState('')
  const [guestCount, setGuestCount] = useState(
    initialValues?.guest_count != null ? String(initialValues.guest_count) : ''
  )
  const [estimatedValue, setEstimatedValue] = useState('')
  const [notes, setNotes] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('offsite')
  const [followUp, setFollowUp] = useState(() => defaultFollowUpYmd(todayYmd()))
  // Inline create-in-flow (event types inc 1). `sessionProfiles` holds types
  // created through the popover THIS mount: they are real server records
  // already, layered over the props until a router.refresh delivers them —
  // so the new option appears, matches, and carries its id immediately. NOT
  // reset with the draft: closing the dialog does not un-create a type.
  const [typePopoverOpen, setTypePopoverOpen] = useState(false)
  const [sessionProfiles, setSessionProfiles] = useState<EventTypeProfile[]>([])
  // Remount handle for the event-type picker. EventTypeSelect deliberately
  // never yanks itself out of Other mode while the operator is typing (a
  // coincidental name match must not steal the field), so after a popover
  // create turns the typed free text into a REAL listed type, the host bumps
  // this key: the remounted picker re-derives its mode from the (now
  // matching) value and shows the new type as the selected option.
  const [pickerEpoch, setPickerEpoch] = useState(0)

  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  // The event-type stop is the select — or EventTypeSelect's plain-input
  // fallback when the org has zero active profiles (only one is mounted).
  const eventTypeRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const guestsRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  /** Set before a state update, consumed by the after-commit effect below, so
   *  focus can land on a field the same update just mounted (a More-details
   *  field behind a closed disclosure, the Name input after create-another
   *  clears a linked customer). */
  const pendingFocusRef = useRef<FieldKey | null>(null)

  function focusField(key: FieldKey) {
    // Partial on purpose: the follow-up keys the validator can also carry
    // (server-door inputs) have no focus target here — the form's own date
    // input can never produce them, so an unmapped key is a quiet no-op.
    const refs: Partial<Record<FieldKey, HTMLElement | null>> = {
      name: nameRef.current,
      phone: phoneRef.current,
      event_type: eventTypeRef.current,
      event_date: dateRef.current,
      guest_count: guestsRef.current,
      email: emailRef.current,
      estimated_value: valueRef.current,
      notes: notesRef.current,
    }
    refs[key]?.focus()
  }

  useEffect(() => {
    if (!pendingFocusRef.current) return
    const key = pendingFocusRef.current
    pendingFocusRef.current = null
    focusField(key)
  })

  // After linking (via the picker OR the recognition card) the input that had
  // focus unmounts; without this, focus drops to <body> and a keyboard user is
  // stranded. WHO is answered at that point, so the next task-flow stop is the
  // event type.
  const wasLinkedRef = useRef(Boolean(linked))
  useEffect(() => {
    const isLinked = Boolean(linked)
    if (isLinked && !wasLinkedRef.current) eventTypeRef.current?.focus()
    wasLinkedRef.current = isLinked
  }, [linked])

  function initDraft() {
    setPicked(null)
    setDismissedIds([])
    setPickerOpen(false)
    setName(''); setPhone(''); setEmail(''); setOrganization(''); setTitle('')
    setEventType(initialValues?.event_type ?? '')
    setGuestCount(initialValues?.guest_count != null ? String(initialValues.guest_count) : '')
    setEventDate(''); setEstimatedValue(''); setNotes('')
    setDeliveryMode('offsite')
    setFollowUp(defaultFollowUpYmd(todayYmd()))
    setMoreOpen(false)
    setTypePopoverOpen(false)
    setErrors({})
    setServerError(null)
    setAnnounce(null)
  }

  // Re-initialize on every open so the follow-up default and cockpit prefill
  // are computed at open time, not mount time. Latest-ref so a parent
  // re-render (new `initialValues` identity) can never wipe a draft mid-typing.
  // The ref is written in an effect, never during render (react-hooks rule) —
  // effects run in order, so the latest closure is in place before the
  // open-effect below ever reads it.
  const initDraftRef = useRef(initDraft)
  useEffect(() => { initDraftRef.current = initDraft })
  useEffect(() => {
    if (open) initDraftRef.current()
  }, [open])

  // Ctx sourcing (contract C5): the pipeline preloads `bookabilityCtx`; the
  // cockpit hands a lazy loader called once on FIRST open, because most
  // cockpit visits never open this form. Loading and failure both render
  // nothing — no spinner jitter on a block most opens never look at.
  const [lazyCtx, setLazyCtx] = useState<BookabilityCtx | null>(null)
  const ctxRequestedRef = useRef(false)
  useEffect(() => {
    if (!open || ctxRequestedRef.current) return
    if (bookabilityCtx !== undefined || !loadBookabilityCtx) return
    ctxRequestedRef.current = true
    loadBookabilityCtx()
      .then((c) => setLazyCtx(c))
      .catch(() => {})
  }, [open, bookabilityCtx, loadBookabilityCtx])
  const ctx = bookabilityCtx !== undefined ? bookabilityCtx : lazyCtx

  // THE ANSWER AT THE FIELD. Pure and in-memory (<100 ms), recomputed as the
  // date is typed. Past dates get the amber tense note INSTEAD of an engine
  // verdict — mirrors useDayVerdict (bookability-context.tsx): every past date
  // is technically `closed` (its book-by passed long ago), and nobody asks
  // whether they were free last Tuesday. The pure function stays honest; the
  // renderer owns the question's tense.
  const referenceToday = ctx?.today ?? todayYmd()
  const dateValid = isValidYmd(eventDate)
  const datePast = dateValid && eventDate < referenceToday
  const verdict = useMemo(
    () => (ctx && dateValid && !datePast ? bookability(eventDate, ctx) : null),
    [ctx, eventDate, dateValid, datePast]
  )

  // CALLER RECOGNITION — zero reads; `customers` is already in client memory.
  // Phone matches on digits (suffix either way, ≥7 digits, so "(208) 555-0142"
  // finds "+1 208 555 0142"); email on the normalized lower-case exact; name on
  // a case-insensitive exact. All three only ever produce the HINT — linking is
  // always an explicit tap, never automatic.
  const recognition = useMemo(() => {
    if (linked || !customers || customers.length === 0) return null
    const typedPhone = digitsOf(phone)
    const typedEmail = email.trim().toLowerCase()
    const typedName = name.trim().toLowerCase()
    return (
      customers.find((c) => {
        if (dismissedIds.includes(c.id)) return false
        if (typedPhone.length >= 7 && c.phone) {
          const d = digitsOf(c.phone)
          if (d.length >= 7 && (d.endsWith(typedPhone) || typedPhone.endsWith(d))) return true
        }
        if (typedEmail && (c.email_lower ?? c.email?.toLowerCase()) === typedEmail) return true
        if (typedName && c.name.trim().toLowerCase() === typedName) return true
        return false
      }) ?? null
    )
  }, [linked, customers, phone, email, name, dismissedIds])

  // ACTIVE profiles: the props' list (archived filtered out) plus any types
  // created inline this session — a session profile stands down as soon as a
  // refreshed props list carries its id or name (no duplicate options or
  // matches). This IS the dropdown's option list: profiles only, never the
  // historical free-text vocabulary — history belongs to adopt-from-history
  // on the settings page, not to this picker.
  const activeProfiles = useMemo(() => {
    const base = activeEventTypeProfiles(eventTypeProfiles)
    const seenIds = new Set(base.map((p) => p.id).filter(Boolean))
    const seenNames = new Set(base.map((p) => p.name.trim().toLowerCase()))
    return [
      ...base,
      ...sessionProfiles.filter(
        (p) => !(p.id && seenIds.has(p.id)) && !seenNames.has(p.name.trim().toLowerCase())
      ),
    ]
  }, [eventTypeProfiles, sessionProfiles])
  const trimmedType = eventType.trim()
  const typeKey = trimmedType.toLowerCase()
  // PROFILE membership, not merged-options membership: the merged list also
  // carries historical free-text types, which the capacity engine treats with
  // the default rule — keying the hint on it misfires both ways. Same
  // trim+lowercase match as leadRequirement (lib/capacity/requirement.ts),
  // last match winning on dupes for the same reason — and the matched
  // profile's id is what the create payload will reference.
  const matchedProfile = useMemo(() => {
    if (trimmedType === '') return undefined
    let matched: EventTypeProfile | undefined
    for (const p of activeProfiles) {
      if (p.name.trim().toLowerCase() === typeKey) matched = p // last match wins
    }
    return matched
  }, [activeProfiles, trimmedType, typeKey])
  const profileMatched = Boolean(matchedProfile)
  // ARCHIVED name match, checked against the FULL props array (this form
  // filters active itself): leadRequirement's name match includes archived
  // profiles, so a typed archived name still gets that ARCHIVED policy and
  // Where is still ignored — the hint and the toggle must not pretend the
  // default rule applies. Active membership wins when both somehow match.
  const archivedNameMatch = useMemo(() => {
    if (trimmedType === '' || matchedProfile) return undefined
    let matched: EventTypeProfile | undefined
    for (const p of eventTypeProfiles ?? []) {
      if (p.archived && p.name.trim().toLowerCase() === typeKey) matched = p // last match wins
    }
    return matched
  }, [eventTypeProfiles, matchedProfile, trimmedType, typeKey])
  // Quiet, never blocking: a free-text type is legitimate (profiles are an
  // overlay, not a migration) — the hint just says what the capacity engine
  // will do with it. An archived name match gets its own truthful hint below.
  const typeUnrecognized =
    activeProfiles.length > 0 && trimmedType !== '' && !profileMatched && !archivedNameMatch
  // A matched profile — active OR archived — is authoritative about Where:
  // leadRequirement ignores delivery_mode entirely on a match, so the toggle
  // would be a dead control and its answer silently discarded. Hide it and
  // submit nothing.
  const deliveryModeRelevant = Boolean(showDeliveryMode) && !profileMatched && !archivedNameMatch

  // Derived, never persisted: the placeholder previews "Jane Doe · Wedding ·
  // Oct 4" but the field submits ONLY what the operator types — persisting the
  // derivation would freeze a label that the fallback (`title ?? name`)
  // already computes live everywhere else.
  const contactName = linked?.name ?? name.trim()
  const derivedTitle = [contactName, trimmedType, dateValid ? shortDayLabel(eventDate) : '']
    .filter(Boolean)
    .join(' · ')

  function buildPayload(parsedGuests?: number, parsedValue?: number): CreateLeadInput {
    return {
      ...(linked
        ? { customer_id: linked.id }
        : {
            name: name.trim(),
            ...(organization.trim() ? { organization: organization.trim() } : {}),
            ...(email.trim() ? { email: email.trim() } : {}),
            ...(phone.trim() ? { phone: phone.trim() } : {}),
          }),
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(trimmedType ? { event_type: trimmedType } : {}),
      // The id ONLY on an active-profile name match (the server re-verifies
      // against the org doc and drops a stale one silently). Free text with
      // no match sends the string alone — never blocks, standing decision.
      ...(matchedProfile?.id ? { event_type_id: matchedProfile.id } : {}),
      ...(eventDate.trim() ? { event_date: eventDate.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(parsedValue != null && !Number.isNaN(parsedValue) ? { estimated_value: parsedValue } : {}),
      ...(parsedGuests != null && !Number.isNaN(parsedGuests) ? { guest_count: parsedGuests } : {}),
      // Only a business-tier org with a venue is asked; offsite is the default
      // and needs no stored flag, so we persist the choice only when the
      // control was shown (and not superseded by a matched profile) and the
      // operator picked on-site.
      ...(deliveryModeRelevant && deliveryMode === 'onsite' ? { delivery_mode: 'onsite' as const } : {}),
      // Empty = no task. The server creates the Task in the same batch as the
      // lead (contract C2), so the opportunity is born with a next step.
      ...(followUp.trim() ? { follow_up_date: followUp.trim() } : {}),
    }
  }

  // The operator's kind words for the popover's policy toggles (singular:
  // the pills read "needs cart" / "needs room" in their vocabulary).
  const mobileOne = kindLabel({ resource_labels: resourceLabels }, 'mobile', 1)
  const venueOne = kindLabel({ resource_labels: resourceLabels }, 'venue', 1)

  /** The popover created (or idempotently found) a profile: layer it over the
   *  props, mirror its canonical name into the field — which selects the new
   *  option and resolves `event_type_id` — and refresh so the server props
   *  catch up. The picker remounts (pickerEpoch) so an Other-mode launch
   *  lands back on the select showing the new type, not on free text that
   *  happens to match. Focus returns to the event-type control via the
   *  popover's finalFocus (the ref tracks the remounted node). When the
   *  create was an idempotent match whose SAVED policy overrides the toggles
   *  the operator just set, say so here in the announce region — the popover
   *  has closed, so its own live region can't carry the line. */
  function handleTypeCreated(profile: EventTypeProfile, info: { existingPolicyKept: boolean }) {
    setSessionProfiles((prev) => [
      ...prev.filter((p) => !(profile.id && p.id === profile.id)),
      profile,
    ])
    setEventType(profile.name)
    setPickerEpoch((n) => n + 1)
    setTypePopoverOpen(false)
    if (info.existingPolicyKept) {
      setAnnounce(`“${profile.name}” already existed — using its saved policy.`)
    }
    router.refresh()
  }

  /** Create-another keeps the WHAT & WHEN half (the operator is logging a run
   *  of similar calls), clears the WHO half and everything personal to it. */
  function resetForAnother() {
    setPicked(null)
    setDismissedIds([])
    setPickerOpen(false)
    setName(''); setPhone(''); setEmail(''); setOrganization(''); setTitle('')
    setGuestCount(''); setEstimatedValue(''); setNotes('')
    setFollowUp(defaultFollowUpYmd(todayYmd()))
    setErrors({})
    setServerError(null)
  }

  async function handleCreate(mode: 'normal' | 'another') {
    if (saving) return
    const parsedGuests = guestCount.trim() === '' ? undefined : Number(guestCount)
    const parsedValue = estimatedValue.trim() === '' ? undefined : Number(estimatedValue)
    // Validate exactly what will be submitted: linked mode snapshots contact
    // fields from the customer record, so typed leftovers are neither sent
    // nor validated. Same rule set as the server and the public intake form.
    const fieldErrors = validateLeadFields(
      {
        ...(linked ? {} : { name, email, phone }),
        event_type: eventType,
        event_date: eventDate,
        notes,
        ...(parsedGuests !== undefined ? { guest_count: parsedGuests } : {}),
        ...(parsedValue !== undefined ? { estimated_value: parsedValue } : {}),
      },
      { requireName: !linked }
    )
    const first = FOCUS_ORDER.find((k) => fieldErrors[k])
    if (first) {
      setErrors(fieldErrors)
      if (MORE_FIELDS.has(first)) setMoreOpen(true)
      pendingFocusRef.current = first
      return
    }
    setErrors({})
    setSaving(true)
    setServerError(null)
    try {
      const lead = await createLead(orgId, buildPayload(parsedGuests, parsedValue))
      onCreated?.(lead, { stayedOpen: mode === 'another' })
      if (mode === 'another') {
        const createdName = lead.name || contactName
        resetForAnother()
        // The dialog stays open, so the call site suppresses its CreatedToast
        // (contract C5b) and THIS live region closes the loop instead.
        setAnnounce(`Opportunity created for ${createdName}.`)
        // Straight back to the top of the next call. No Name field in pinned
        // cockpit mode — the event type is the first stop there.
        pendingFocusRef.current = customer ? 'event_type' : 'name'
      } else {
        initDraft()
        onClose()
      }
      router.refresh()
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setSaving(false)
    }
  }

  /** EVERY close path — Escape, backdrop, ✕, Cancel — resets the draft. One
   *  consistent behavior (defect #10), routed through the Dialog's
   *  onOpenChange so no path can forget the reset. */
  function handleClose() {
    initDraft()
    onClose()
  }

  function onFormKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    // ⌘/Ctrl+↩ submits from anywhere including the textarea; +⇧ is save-and-
    // create-another (Linear parity). Plain Enter is left to the browser's
    // implicit submission — real <form>, no re-implementation.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleCreate(e.shiftKey ? 'another' : 'normal')
    }
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-lg"
        initialFocus={customer ? eventTypeRef : nameRef}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          {/* A real, visible h2 (defect #16) — DialogTitle renders one. */}
          <DialogTitle>New opportunity</DialogTitle>
        </DialogHeader>
        {/* noValidate: validation is ours (per-field messages, focus
            management); the native bubbles would race it on the email field. */}
        <form
          onSubmit={(e) => { e.preventDefault(); void handleCreate('normal') }}
          onKeyDown={onFormKeyDown}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Scrollable body; the footer below stays put so Create is visible
              with the core fields at 375×812. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {/* Server-side failures and the create-another confirmation land
                here; field errors live at their fields. */}
            <div aria-live="polite" aria-atomic="true">
              {serverError && <p className="mb-3 text-sm text-destructive">{serverError}</p>}
              {!serverError && announce && (
                <p className="mb-3 text-sm text-muted-foreground">{announce}</p>
              )}
            </div>
            <div className="space-y-5">
              <fieldset>
                <SectionLegend>Who</SectionLegend>
                {customer ? (
                  <p className="text-sm text-muted-foreground">
                    For {customer.name}{customer.company ? ` · ${customer.company}` : ''}
                  </p>
                ) : linked ? (
                  <CustomerPicker
                    customers={customers ?? []}
                    value={linked}
                    onChange={(c) => { setPicked(c); if (!c) setPickerOpen(false) }}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="leadName">
                          Name <span aria-hidden className="text-muted-foreground">*</span>
                        </Label>
                        <Input
                          ref={nameRef}
                          id="leadName"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Contact name"
                          aria-required="true"
                          aria-invalid={errors.name ? true : undefined}
                          aria-describedby={errors.name ? 'leadName-error' : undefined}
                        />
                        <FieldError id="leadName-error">{errors.name}</FieldError>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="leadPhone">Phone</Label>
                        <Input
                          ref={phoneRef}
                          id="leadPhone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="off"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(555) 555-5555"
                          aria-invalid={errors.phone ? true : undefined}
                          aria-describedby={errors.phone ? 'leadPhone-error' : undefined}
                        />
                        <FieldError id="leadPhone-error">{errors.phone}</FieldError>
                      </div>
                    </div>
                    {recognition && (
                      <CallerMatchHint
                        customer={recognition}
                        pastJobs={pastJobCounts?.[recognition.id]}
                        onLink={() => setPicked(recognition)}
                        onDismiss={() => setDismissedIds((ids) => [...ids, recognition.id])}
                      />
                    )}
                    {customers && customers.length > 0 && (
                      pickerOpen ? (
                        <CustomerPicker
                          customers={customers}
                          value={null}
                          onChange={(c) => { setPicked(c); if (!c) setPickerOpen(false) }}
                          autoFocus
                        />
                      ) : (
                        // Recognition (above) does the finding; the explicit
                        // search is the fallback, collapsed so it costs no
                        // tab stop until asked for.
                        <button
                          type="button"
                          onClick={() => setPickerOpen(true)}
                          className="inline-flex min-h-6 items-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          or search clients
                        </button>
                      )
                    )}
                    {customers?.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        This will be your first client.
                      </p>
                    )}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <SectionLegend>What &amp; when</SectionLegend>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="leadEventType">Event type</Label>
                    {/* ONE dropdown — the same EventTypeSelect the intake
                        form and the opportunity editors use (the chip row
                        over an echoing input read as a TAG control and was
                        rejected). Listed pick = active profile; "Something
                        else…" reveals free text (which never blocks); the
                        admin's "+ New event type…" lives INSIDE the list.
                        With zero active profiles this renders the plain
                        free-text input, exactly like the intake form. */}
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <EventTypeSelect
                          key={pickerEpoch}
                          profiles={activeProfiles}
                          value={eventType}
                          onChange={(next) => setEventType(next.event_type)}
                          id="leadEventType"
                          otherInputId="leadEventTypeOther"
                          otherAriaLabel="Custom event type"
                          otherPlaceholder="e.g. Wedding"
                          otherOptionLabel="Something else…"
                          autoFocusOther
                          controlRef={eventTypeRef}
                          ariaInvalid={errors.event_type ? true : undefined}
                          ariaDescribedby={errors.event_type ? 'leadEventType-error' : undefined}
                          onCreateNew={canCreateEventTypes ? () => setTypePopoverOpen(true) : undefined}
                        />
                      </div>
                      {activeProfiles.length === 0 && canCreateEventTypes && (
                        // Zero-state ONLY: with no list to pin the create
                        // option into, the popover's trigger sits beside the
                        // plain input. Never chips.
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setTypePopoverOpen(true)}
                          className="shrink-0 border-dashed text-muted-foreground"
                        >
                          + New type
                        </Button>
                      )}
                    </div>
                    {typeUnrecognized && (
                      <p className="text-xs text-muted-foreground">
                        Not a configured event type — capacity uses the default rule.
                        {canCreateEventTypes && (
                          <>
                            {' '}
                            <button
                              type="button"
                              onClick={() => setTypePopoverOpen(true)}
                              className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-foreground"
                            >
                              Add as event type
                            </button>
                          </>
                        )}
                      </p>
                    )}
                    {archivedNameMatch && (
                      <p className="text-xs text-muted-foreground">
                        Archived type — its saved policy still applies.
                      </p>
                    )}
                    {activeProfiles.length === 0 && !archivedNameMatch && (
                      // 0-profiles onboarding (spec §empty states): free text
                      // always works; the link says where verdicts come from.
                      // Suppressed while an archived name matches — "configure
                      // profiles to get verdicts" reads wrong when the typed
                      // type already HAS a (saved, archived) policy.
                      <p className="text-xs text-muted-foreground">
                        Type any event type —{' '}
                        <Link
                          href={`/${orgSlug}/event-types`}
                          className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-foreground"
                        >
                          configure profiles to get capacity verdicts
                        </Link>
                      </p>
                    )}
                    <FieldError id="leadEventType-error">{errors.event_type}</FieldError>
                    {canCreateEventTypes && (
                      /* Stacked over this dialog; portalled to <body>, so its
                         <form> never nests in this one. Prefill = what the
                         operator already said: the unmatched free text and
                         the current Where answer. */
                      <NewEventTypePopover
                        orgId={orgId}
                        open={typePopoverOpen}
                        onClose={() => setTypePopoverOpen(false)}
                        onCreated={handleTypeCreated}
                        initialName={profileMatched ? '' : trimmedType}
                        initialNeedsVenue={deliveryMode === 'onsite'}
                        mobileLabel={mobileOne}
                        venueLabel={venueOne}
                        returnFocusRef={eventTypeRef}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="leadEventDate">Event date</Label>
                      {/* No `min`: a past date is allowed (back-logging real
                          inquiries) — it gets the amber note below instead of
                          a silent clamp or a block. */}
                      <Input
                        ref={dateRef}
                        id="leadEventDate"
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        aria-invalid={errors.event_date ? true : undefined}
                        aria-describedby={errors.event_date ? 'leadEventDate-error' : undefined}
                      />
                      <FieldError id="leadEventDate-error">{errors.event_date}</FieldError>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="leadGuestCount">Guests</Label>
                      <Input
                        ref={guestsRef}
                        id="leadGuestCount"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={guestCount}
                        onChange={(e) => setGuestCount(e.target.value)}
                        aria-invalid={errors.guest_count ? true : undefined}
                        aria-describedby={errors.guest_count ? 'leadGuestCount-error' : undefined}
                      />
                      <FieldError id="leadGuestCount-error">{errors.guest_count}</FieldError>
                    </div>
                  </div>
                  {datePast && (
                    <p
                      data-slot="past-date-note"
                      className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--warn-fg)]"
                    >
                      That date is in the past.
                    </p>
                  )}
                  {verdict && (
                    <BookabilityBanner
                      orgSlug={orgSlug}
                      bookability={verdict}
                      onPickAlternative={setEventDate}
                      className="mx-0"
                    />
                  )}
                  {deliveryModeRelevant && (
                    <DeliveryModeToggle
                      value={deliveryMode}
                      onChange={setDeliveryMode}
                      idPrefix="new-lead-delivery"
                    />
                  )}
                </div>
              </fieldset>

              <fieldset>
                <SectionLegend>Next</SectionLegend>
                <FollowUpField value={followUp} onChange={setFollowUp} />
              </fieldset>

              <div className="space-y-3">
                <button
                  type="button"
                  aria-expanded={moreOpen}
                  // Conditional: the panel is conditionally RENDERED (values
                  // live in state, so nothing is lost), and aria-controls must
                  // not point at an id that is not in the document.
                  aria-controls={moreOpen ? 'leadMoreDetails' : undefined}
                  onClick={() => setMoreOpen((v) => !v)}
                  className="inline-flex min-h-6 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronRightIcon
                    aria-hidden
                    className={cn(
                      'size-3.5 transition-transform motion-reduce:transition-none',
                      moreOpen && 'rotate-90'
                    )}
                  />
                  More details
                </button>
                {moreOpen && (
                  <div id="leadMoreDetails" className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="leadTitle">Title</Label>
                      <Input
                        id="leadTitle"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder={derivedTitle || 'e.g. Riverside gala'}
                      />
                    </div>
                    {!linked && (
                      <>
                        <div className="space-y-1">
                          <Label htmlFor="leadOrg">Organization</Label>
                          <Input
                            id="leadOrg"
                            value={organization}
                            onChange={(e) => setOrganization(e.target.value)}
                            placeholder="Company / organization"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="leadEmail">Email</Label>
                          <Input
                            ref={emailRef}
                            id="leadEmail"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            aria-invalid={errors.email ? true : undefined}
                            aria-describedby={errors.email ? 'leadEmail-error' : undefined}
                          />
                          <FieldError id="leadEmail-error">{errors.email}</FieldError>
                        </div>
                      </>
                    )}
                    <div className="space-y-1">
                      <Label htmlFor="leadValue">Estimated value</Label>
                      <div className="relative">
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground"
                        >
                          $
                        </span>
                        <Input
                          ref={valueRef}
                          id="leadValue"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={estimatedValue}
                          onChange={(e) => setEstimatedValue(e.target.value)}
                          className="pl-6"
                          aria-invalid={errors.estimated_value ? true : undefined}
                          aria-describedby={errors.estimated_value ? 'leadValue-error' : undefined}
                        />
                      </div>
                      <FieldError id="leadValue-error">{errors.estimated_value}</FieldError>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="leadNotes">Notes</Label>
                      {/* Kit-consistent by hand (the kit ships no Textarea and
                          is frozen): tokens copied from components/ui/input.tsx
                          — rounded-lg, the focus ring triple, the aria-invalid
                          destructive ring. */}
                      <textarea
                        ref={notesRef}
                        id="leadNotes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Notes"
                        className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
                        aria-invalid={errors.notes ? true : undefined}
                        aria-describedby={errors.notes ? 'leadNotes-error' : undefined}
                      />
                      <FieldError id="leadNotes-error">{errors.notes}</FieldError>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create opportunity'}
              {!saving && (
                <kbd
                  aria-hidden
                  className="ml-1 rounded border border-current/30 px-1 font-mono text-[10px] leading-4"
                >
                  {isMac ? '⌘↩' : 'Ctrl+↩'}
                </kbd>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
