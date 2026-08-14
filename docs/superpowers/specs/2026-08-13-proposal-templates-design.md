# Proposal Templates — Design

Approved in conversation 2026-08-13. Goal: operators save and reuse their own
full proposal documents as templates — pickable at proposal creation, managed
in Settings — without forking the builder or the document model.

## Decisions (with rationale)

1. **A template is a proposal-shaped document.** `ProposalTemplate` stores the
   proposal *content* fields verbatim — `blocks`, `line_items`, `packages`,
   `discount`, `tax_rate`, `deposit`, `deposit_gate`, `deposit_terms`, `terms`,
   `notes` — plus `name`, `description?`, `usage_count`, timestamps. It has no
   lead, token, status, expiry, or signature fields. Stored at
   `orgs/{orgId}/proposal_templates/{id}`.
   *Rationale:* one document shape means the existing builder canvases edit
   templates unchanged, and template capability never lags proposal capability.

2. **Rejected alternatives:** flagged proposals on a sentinel "library" lead
   (pollutes every proposal query/rollup); a separate lightweight template
   model + dedicated editor (parallel editor diverges immediately).

3. **Three creation paths, one editor.**
   - "Save as template" in the proposal builder's overflow menu (name prompt,
     copies current draft content).
   - Settings → Proposal templates → New template (starts empty).
   - "New template" card on the New-proposal picker.
   All roads lead to `/{orgSlug}/proposal-templates/{templateId}` — a
   `TemplateBuilderClient` that reuses `ProposalTheme` + `BlockCanvas` +
   `PricingCanvas` + `TotalsCanvas` with a slim `TemplateTopBar` (inline name,
   autosave status, back link, delete). No Send, no status badge, no client
   link, no AI composer (AI drafting consumes lead context; templates have
   none — v1 omits it), no void.

4. **Autosave reuse.** `useDraftAutosave` gains an injectable `save` function
   (defaults to `updateProposalDraft`, preserving current behavior). Templates
   pass `updateTemplateDraft`, which runs the same `normalizeProposalDraft`
   full-state semantics minus proposal-only fields (`expires_at` is not a
   template field: expiry is per-proposal).

5. **Copy semantics are verbatim snapshots.** Proposal → template and
   template → proposal copy the content fields as-is, through an explicit
   allowlist. Block/line-item/package ids are copied unchanged — ids only need
   uniqueness within one document, and preserving them keeps package
   `item_ids` references intact. `placeholder` flags on blocks survive both
   directions (they keep their grey-guidance semantics in the template
   editor and on any proposal created from the template). No merge fields in
   v1 ({{client_name}}-style tokens are a future increment; skeleton
   contact-autofill remains a skeleton-only feature).

6. **Create-from-template mirrors the skeleton flow.** The picker calls
   `createProposal(orgId, leadId, { title })` (CRM-autofilled title, org
   default terms seeded), then applies the template content in one
   `updateProposalDraft` full-state call — with the template's `terms` (if
   any) replacing the org default, and the autofilled `title` kept.
   `usage_count` increments (best-effort) on the template.

7. **New-proposal picker layout.** When the org has templates: a "Your
   templates" section first (name, description, item/package counts), then
   "Start fresh" with the four built-in skeletons unchanged, plus a quiet
   "New template" card. With no templates, today's screen plus the "New
   template" card. Built-ins are not user-editable and never appear in
   Settings.

8. **Settings surface.** Sidebar Settings group gains "Proposal templates" →
   `/{orgSlug}/proposal-templates`: rows with name, updated date, used-N-times,
   and rename / duplicate / delete actions; "New template" button. Duplicate
   copies the document with name "… (copy)".

9. **Menu Packages / catalog: no direct coupling in v1.** Templates snapshot
   package tiers and line items. The already-queued ops "proposal refs"
   increment (line items referencing catalog items) will apply to templates
   automatically because templates store the same line-item shape.

10. **Permissions.** All template CRUD behind `assertOrgAdmin` (same gate as
    proposal actions). Reads for the picker use the member-level page context
    it already has (`assertOrgMember` on list).

## Components

- `lib/proposals/templates.ts` — pure: `TEMPLATE_CONTENT_FIELDS` allowlist,
  `templateContentFromProposal(draft)`, `proposalDraftFromTemplate(template,
  { title, fallbackTerms })`. Unit-tested.
- `actions/proposal-templates.ts` — `listProposalTemplates`,
  `getProposalTemplate`, `createProposalTemplate` (empty or from content),
  `updateTemplateDraft`, `renameProposalTemplate`, `duplicateProposalTemplate`,
  `deleteProposalTemplate`, `createProposalFromTemplate`, `bumpTemplateUsage`
  (folded into create-from-template).
- `components/admin/proposal-builder/SkeletonPicker.tsx` — grows a templates
  section (props gain `templates`).
- `components/admin/templates/TemplateBuilderClient.tsx` + `TemplateTopBar.tsx`.
- `app/(admin)/[orgSlug]/proposal-templates/page.tsx` (list) and
  `[templateId]/page.tsx` (editor).
- `components/layout/AdminSidebar.tsx` — settings link.
- `TopBar.tsx` / `ProposalBuilderClient.tsx` — "Save as template" overflow item
  + handler (prompt for name → action → flash confirmation).

## Error handling

- Template not found on editor route → `notFound()`.
- Create-from-template with a deleted template → picker error line (same
  aria-live pattern the picker uses today).
- Autosave failures in template mode inherit the hook's retry state machine.
- Image uploads inside a template reuse `uploadProposalImage` with the
  template id as the document id (uploads are org-scoped storage paths keyed
  by an opaque id — verify at implementation; if the path embeds a proposal
  id it works identically with a template id).

## Testing

- Unit: copy functions (allowlist, verbatim ids, terms fallback, placeholder
  preservation), template draft normalization (expires_at rejected/dropped).
- Actions: CRUD auth-gated, create-from-template composes create + draft +
  usage bump, duplicate names "(copy)".
- Component: SkeletonPicker renders templates section when templates exist;
  TemplateBuilderClient hides Send/AI affordances (render test).
- `npx vitest run`, `npx tsc --noEmit` (one pre-existing calendar-feed error
  is known), `npx next build` before the branch is called green.
