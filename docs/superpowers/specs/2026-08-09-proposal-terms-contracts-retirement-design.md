# Proposal Terms + Contracts Retirement — Design

Date: 2026-08-09
Status: approved
Branch: `claude/proposal-terms-retire-contracts`

## Goal

One signed document. The proposal gains a legal-terms section covered by the
existing e-signature (hash-pinned canonical document, optionally deposit-backed
via Stripe). The standalone contracts feature — which duplicates this with a
weaker signature (typed name, no document hash, no pricing) — is removed
outright, freeing its sidebar slot, admin pages, public route, and client-portal
card.

Why now: contracts occupy real estate (Pipeline sub-nav child, admin list page,
per-lead editor, public `/contracts/[token]` route, portal card, attachment
chip, convert-gate clause) while the signed proposal already *is* the agreement.
Signing a proposal sets `status: 'accepted'` and the `signature` record in one
transaction (`actions/proposals-public.ts`), so "accepted proposal" already
means "signed document."

No real contract data exists in production (confirmed 2026-08-09); existing
Firestore contract docs stay inert. No migration, no archive view.

## Data model

- **`Proposal.terms?: string`** — plain text legal terms, same shape as
  `deposit_terms`. Absent on all existing proposals.
- **`Org.default_proposal_terms?: string`** — the org's standard terms, edited
  in org settings. New proposal drafts copy it in (a snapshot, not a live
  reference — editing the org default never mutates existing proposals).
- **Signature hash:** `canonicalProposalDocument` (`lib/proposal-signature.ts`)
  includes `terms` **only when present** — conditional spread, the same pattern
  pricing v2 used. Legacy signed documents serialize byte-for-byte identically;
  the golden fixtures in `__tests__/lib/proposal-signature-goldens.test.ts`
  must pass unmodified. `SignableProposal` adds `'terms'` to its pick list.
- **Size guard:** terms capped at 10,000 chars in the update action — the
  proposal is one Firestore document with a 1 MB ceiling and this is the only
  enforcement point.
- **Deleted:** the `Contract` interface, `ContractStatus`, `lib/contracts.ts`.

## Authoring UX

- **Org settings** gains a "Proposal terms" textarea (saved via
  `actions/orgs.ts`), described as "included on every new proposal."
- **Builder:** a "Terms" textarea in the RightRail beneath the deposit section
  (`components/admin/proposal-builder/RightRail.tsx`) — a fixed section, not a
  layout block, so layout edits can never move or delete it. Clearing it means
  no terms on this proposal.
- **AI drafting never touches terms.** The generation schema and skeletons gain
  no terms field — legal text is not something the AI writes or rewrites.

Terms are deliberately NOT a `ProposalBlock`: blocks are excluded from the
signature hash, are movable/deletable, and hashing one special block type out
of the layout would complicate the canonical document for no benefit.

## Customer-facing render

- **Public response page** (`components/proposals/ProposalResponseClient.tsx`):
  terms render in their own titled section directly above the signature/accept
  area, alongside where `deposit_terms` shows today — what's being agreed to
  sits next to the act of agreeing. The existing "by signing…" language now
  truthfully covers them.
- **Print page** (`app/(public)/proposals/[token]/print/page.tsx`) renders the
  same section, so the printable view is the complete agreement.
- No separate "I agree" checkbox — the signature covers the document, same as
  deposit terms today (YAGNI; revisit only on customer request).

## Rewiring what contracts touched

- **Convert guidance** (`lib/opportunity-detail.ts` `convertBlockReason`): drop
  the contract clause entirely. The accepted-proposal check already implies a
  signed document; its message absorbs the "carries the accepted package +
  guests into Events" detail.
- **Attachment chips** (`attachmentChips`): the `contract` chip goes away; the
  proposal chip's `accepted` hint already communicates signed state.
- **Client portal** (`components/client-portal/ClientPortalView.tsx` and
  `actions/client-portal-public.ts`): the Contracts card and its data plumbing
  are removed; the portal's proposal links are the agreement record.
- **Sidebar** (`components/layout/AdminSidebar.tsx`): `contracts` leaves
  `PIPELINE_CHILD_SLUGS` and the module list.
- **Industry packs** (`lib/industry-packs.ts`): the `'contracts'` module id is
  removed from the module union and every pack's list.
- **Billing plans** (`lib/billing-plans.ts`): blurb copy drops the word.
- **Public-profile reserved handles** (`lib/public-profile.ts`): `'contracts'`
  stays reserved — harmless, and avoids ever colliding with a resurrected
  route.

## Deletion inventory

- Routes: `app/(admin)/[orgSlug]/contracts/`,
  `app/(admin)/[orgSlug]/leads/[leadId]/contracts/`, `app/(public)/contracts/`.
- Components: `components/contracts/ContractSignClient.tsx`,
  `components/admin/LeadContractsClient.tsx`,
  `components/admin/ContractEditorClient.tsx`,
  `components/admin/AllContractsTable.tsx`, plus the contract sections inside
  `app/(admin)/[orgSlug]/leads/[leadId]/page.tsx`,
  `components/admin/OpportunityDetailClient.tsx`, and
  `components/admin/opportunity/TasksAndDocuments.tsx`.
- Actions: `actions/contracts.ts`, `actions/contracts-public.ts`.
- Lib: `lib/contracts.ts`; `Contract`/`ContractStatus` in `lib/types.ts`.
- Tests: `__tests__/actions/contracts.test.ts`,
  `__tests__/actions/contracts-public.test.ts`,
  `__tests__/lib/contracts.test.ts`, plus contract fixtures inside the
  opportunity-detail, opportunity-health, attachment-chip, tasks-and-documents,
  client-portal, and industry-pack tests.
- Firestore rules: nothing to change — all contract access was via the admin
  SDK; the rules file has no contract entries.

## Testing

- **Hash goldens pass unmodified** — the proof that legacy signed documents are
  unaffected. Never regenerate them to make a failure pass.
- New unit tests: terms present/absent changes the hash; draft creation copies
  the org default; the terms length cap is enforced.
- Component tests: response page shows terms above the signature area; builder
  edits terms; convert guidance and chips render without contracts.
- Gates before calling the branch green: full vitest run **and** `next build`
  (the `'use server'` type-re-export trap that tsc alone misses).

## Sequencing (one branch, two stages)

1. **Additive:** terms end-to-end — org settings → draft prefill → builder →
   public/print render → signature hash.
2. **Subtractive:** contracts removal + convert/chips/portal/sidebar/packs
   rewiring.
