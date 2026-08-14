# Proposal Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org-owned proposal templates: full-document snapshots pickable at proposal creation, managed in Settings, editable in a builder variant. Spec: `docs/superpowers/specs/2026-08-13-proposal-templates-design.md`.

**Architecture:** `ProposalTemplate` documents at `orgs/{orgId}/proposal_templates`, same content shape as proposals. Pure copy helpers in `lib/proposals/templates.ts`; guard-free core + `assertOrgAdmin` actions in `actions/proposal-templates.ts`; `TemplateBuilderClient` reuses the shipped canvases with an injectable autosave function; SkeletonPicker grows a templates section; Settings gets a list page + sidebar link; proposal TopBar gains "Save as template".

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` guides before route work), TypeScript, Tailwind + shadcn/ui, Vitest, firebase-admin.

## Global Constraints

- TDD each task: failing test → implement → pass → commit.
- `next build` mandatory before green; one pre-existing tsc error (`__tests__/lib/calendar-feed.test.ts`) is known and out of scope.
- No type re-exports from `'use server'` modules.
- Full-state draft semantics: absent key = cleared (mirror `CLEARABLE_FIELDS`, minus `expires_at` which templates never persist).
- Copy semantics: explicit allowlist, ids verbatim, `placeholder` flags preserved.
- Push via `gh auth switch --user Lifewithmo`.

---

### Task 1: Type + pure copy helpers

**Files:** Modify `lib/types.ts`; Create `lib/proposals/templates.ts`; Test `__tests__/lib/proposals/templates.test.ts`.

**Produces:**
```ts
export interface ProposalTemplate {
  id: string
  org_id: string
  name: string
  description?: string
  blocks?: ProposalBlock[]
  line_items: ProposalLineItem[]
  packages?: ProposalPackage[]
  discount?: ProposalDiscount
  tax_rate?: number
  deposit?: ProposalDeposit
  deposit_gate?: 'before_accept' | 'after_accept'
  deposit_terms?: string
  terms?: string
  notes?: string
  usage_count?: number
  created_at: string
  updated_at?: string
}
```
`lib/proposals/templates.ts`:
- `TEMPLATE_CONTENT_FIELDS` (the 10 content keys above)
- `templateContentFromDraft(d: ProposalDraftUpdate): TemplateContent` — allowlist pick, drops undefined
- `proposalDraftFromTemplate(t: ProposalTemplate, opts: { title: string; fallbackTerms?: string }): ProposalDraftInput` — content + title; template terms win over fallbackTerms; never emits `expires_at`

**Tests:** allowlist pick ignores proposal-only fields (`token`, `status`, `expires_at`); ids/placeholder flags copied verbatim; terms fallback both directions.

- [ ] Steps: failing test → run → implement → run → commit `feat(templates): ProposalTemplate type + pure copy helpers`

### Task 2: CRUD core + actions

**Files:** Create `actions/proposal-templates.ts` (server actions + core in `lib/proposals/templates-store.ts` if cleaner); Test `__tests__/actions/proposal-templates.test.ts` (follow `__tests__/actions/activity.test.ts` firestore mock pattern).

**Produces (all `assertOrgAdmin` unless noted):**
- `listProposalTemplates(orgId)` (member-level: `assertOrgMember`)
- `getProposalTemplate(orgId, id)`
- `createProposalTemplate(orgId, input: { name: string; content?: TemplateContent })` → template (16-hex id, created_at)
- `renameProposalTemplate(orgId, id, name)`
- `duplicateProposalTemplate(orgId, id)` → name "… (copy)", usage_count reset
- `deleteProposalTemplate(orgId, id)`

**Tests:** create validates non-empty name; duplicate appends "(copy)" and resets usage; delete calls doc delete; auth asserted.

- [ ] Steps: failing tests → implement → pass → commit `feat(templates): template CRUD actions`

### Task 3: Template autosave path

**Files:** Modify `components/admin/proposal-builder/useDraftAutosave.ts` (injectable `save?: (input: ProposalDraftInput) => Promise<{ adjustments: string[]; persisted: ProposalDraftUpdate }>`-shaped seam — keep default exactly `updateProposalDraft` behavior); add `updateTemplateDraft(orgId, templateId, input)` action reusing `normalizeProposalDraft`, writing full-state with template clearable fields (no `expires_at`), returning persisted draft + adjustments; Test normalization/clearing in `__tests__/actions/proposal-templates.test.ts`.

**Note:** inspect `useDraftAutosave`'s response re-seed shape first; adapt the injectable signature so the proposal path is byte-identical (default parameter, no behavior change — existing builder tests must stay green).

- [ ] Steps: failing test (updateTemplateDraft drops expires_at, clears absent fields) → implement → pass → commit `feat(templates): template draft autosave path`

### Task 4: Template editor + Settings pages + sidebar

**Files:** Create `components/admin/templates/TemplateTopBar.tsx`, `components/admin/templates/TemplateBuilderClient.tsx`, `app/(admin)/[orgSlug]/proposal-templates/page.tsx` (list: name, updated, used-N-times, rename/duplicate/delete, New template), `app/(admin)/[orgSlug]/proposal-templates/[templateId]/page.tsx` (editor; `notFound()` on missing); Modify `components/layout/AdminSidebar.tsx` settingsLinks (+`{ slug: 'proposal-templates', label: 'Proposal templates' }` with a fitting existing icon).

**TemplateBuilderClient:** mirror ProposalBuilderClient's canvas wiring (ProposalTheme + BlockCanvas + PricingCanvas + TotalsCanvas + image upload with templateId), autosave via Task 3 seam, no Send/status/AI/void/client-link. TemplateTopBar: back link to list, inline name (renameProposalTemplate on blur, or fold name into draft — keep name OUT of draft; separate rename action), autosave status, Delete with confirm.

**Test:** render test — TemplateBuilderClient shows canvases, no "Send" button (`__tests__/components/admin/templates/TemplateBuilderClient.test.tsx`, follow PipelineStatsHeader.test.tsx render pattern).

- [ ] Steps: failing render test → implement pages/components → pass → commit `feat(templates): template editor + settings management page`

### Task 5: Picker integration + create-from-template

**Files:** Modify `components/admin/proposal-builder/SkeletonPicker.tsx` (props gain `templates: ProposalTemplate[]`; "Your templates" section above "Start fresh"; "New template" card routing to `/{orgSlug}/proposal-templates/new` → create-then-redirect helper or create inline then push); Modify `app/(admin)/[orgSlug]/leads/[leadId]/proposals/new/page.tsx` (fetch templates, pass through); Add `createProposalFromTemplate(orgId, leadId, templateId, { title })` to `actions/proposal-templates.ts`: `createProposal` → `proposalDraftFromTemplate` → `updateProposalDraftCore` → best-effort usage bump.

**Tests:** action composes the three calls, keeps autofilled title, template terms override org default (org default used when template has none); SkeletonPicker render: templates section when non-empty, absent when empty.

- [ ] Steps: failing tests → implement → pass → commit `feat(templates): pick a template at proposal creation`

### Task 6: Save as template from the builder

**Files:** Modify `components/admin/proposal-builder/TopBar.tsx` (overflow item "Save as template", callback prop), `ProposalBuilderClient.tsx` (name prompt → `createProposalTemplate` with `templateContentFromDraft(draft)` → flash "Template saved").

**Test:** pure — `templateContentFromDraft` already covered; component change verified by existing builder tests still passing + tsc.

- [ ] Steps: implement → tests/tsc pass → commit `feat(templates): save any proposal as a template`

### Task 7: Green build, roadmap, PR

- [ ] `npx vitest run` all green; `npx tsc --noEmit` (only the known pre-existing error); `npx next build` green
- [ ] ROADMAP.md: In-flight entry for proposal templates (and move the stale Pipeline KPI header entry to Shipped — it merged as PR #77)
- [ ] Commit, `gh auth switch --user Lifewithmo`, push, `gh pr create`
