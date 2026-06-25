# Phase 4c: Bulk Org Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. SECURITY-RELEVANT (creates orgs + owner invitations). Steps use checkbox (`- [ ]`).

**Goal:** A network admin pastes a list of `Church Name, admin@email` rows and the system creates each org (auto-linked to the network with a unique slug) plus an **owner invitation** for the admin email, then surfaces the accept links to distribute.

**Architecture:** A pure `parseOnboardRows(text)` parses/validates the pasted text into `{ orgName, adminEmail }` rows (with per-line errors). `bulkOnboardOrgs(networkId, rows)` (gated by `assertNetworkAdmin`) processes rows sequentially: computes a **unique** org slug (loop appending `-2`, `-3`… since `createOrg` does NO uniqueness check today), creates the org doc with `network_id`/`billing_status:'trialing'` (NO network-admin membership, NO claims — the admin owns it after accepting), and writes an `OrgInvitation` (role `owner`) at `orgs/{orgId}/invitations/{token}`. Returns per-row results (slug + invite token, or error). A network "Onboard orgs" page parses → previews → submits → shows results with copyable `/accept-invite?token=…` links. The existing accept-invite flow turns each link into the org's owner.

**Tech Stack:** Next.js 16, Firebase Admin, Vitest. Reuses `buildInviteToken` (lib/tokens.ts), `OrgInvitation`/`Org` types, `getOrgBySlug`, 4a's network model/guards.

**Scope note:** Phase **4c**. DEFERRED: auto-emailing the invitations (no invite-email template exists yet — links are surfaced for the network admin to distribute); CSV file upload (paste a textarea instead); re-inviting/resending; pushing templates to the new orgs (4b already exists — do it after they accept).

**Baseline:** 314 tests passing.

---

## Task 1: parse helper

**Files:** Create `lib/bulk-onboard.ts`, `__tests__/lib/bulk-onboard.test.ts`.

- [ ] **Step 1: failing test** — `__tests__/lib/bulk-onboard.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseOnboardRows } from '@/lib/bulk-onboard'

describe('parseOnboardRows', () => {
  it('parses "Name, email" lines', () => {
    const rows = parseOnboardRows('First Baptist, pastor@fb.org\nGrace Chapel, admin@grace.org')
    expect(rows).toEqual([
      { orgName: 'First Baptist', adminEmail: 'pastor@fb.org' },
      { orgName: 'Grace Chapel', adminEmail: 'admin@grace.org' },
    ])
  })

  it('trims whitespace and ignores blank lines', () => {
    const rows = parseOnboardRows('  First Baptist ,  pastor@fb.org  \n\n')
    expect(rows).toEqual([{ orgName: 'First Baptist', adminEmail: 'pastor@fb.org' }])
  })

  it('flags rows with a missing field or invalid email', () => {
    const rows = parseOnboardRows('No Email Church\nBad Email, not-an-email\nOK, a@b.co')
    expect(rows[0]).toMatchObject({ orgName: 'No Email Church', error: expect.any(String) })
    expect(rows[1]).toMatchObject({ orgName: 'Bad Email', adminEmail: 'not-an-email', error: expect.any(String) })
    expect(rows[2]).toEqual({ orgName: 'OK', adminEmail: 'a@b.co' })
  })

  it('handles an org name containing commas (splits on the FIRST comma only is NOT required — last token is the email)', () => {
    // email is the last comma-separated token; the rest (joined) is the name
    const rows = parseOnboardRows('St. John, Vianney, office@stjv.org')
    expect(rows).toEqual([{ orgName: 'St. John, Vianney', adminEmail: 'office@stjv.org' }])
  })
})
```

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: create `lib/bulk-onboard.ts`:**
```typescript
export interface OnboardRow {
  orgName: string
  adminEmail: string
  error?: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Parse pasted "Org Name, admin@email" lines. The email is the LAST comma-separated
// token (so org names may contain commas); the rest is the name. Blank lines ignored.
// Rows missing a field or with an invalid email get an `error` string.
export function parseOnboardRows(text: string): OnboardRow[] {
  const rows: OnboardRow[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length < 2) {
      rows.push({ orgName: parts[0] ?? '', adminEmail: '', error: 'Missing admin email (use "Name, email")' })
      continue
    }
    const adminEmail = parts[parts.length - 1]
    const orgName = parts.slice(0, -1).join(', ').trim()
    if (!orgName) {
      rows.push({ orgName: '', adminEmail, error: 'Missing organization name' })
    } else if (!EMAIL_RE.test(adminEmail)) {
      rows.push({ orgName, adminEmail, error: 'Invalid email address' })
    } else {
      rows.push({ orgName, adminEmail })
    }
  }
  return rows
}
```

- [ ] **Step 4: run → PASS.** `npx tsc --noEmit && npx vitest run` → 314 + 4.

- [ ] **Step 5: commit**
```bash
git add lib/bulk-onboard.ts "__tests__/lib/bulk-onboard.test.ts"
git commit -m "feat: parseOnboardRows — parse pasted Name,email rows for bulk org onboarding"
```

---

## Task 2: bulkOnboardOrgs action + unique slug

**Files:** `actions/networks.ts`, `__tests__/actions/networks.test.ts`.

- [ ] **Step 1: failing tests** — append to `__tests__/actions/networks.test.ts`. Mock `@/lib/auth/assert` (assertNetworkAdmin → resolve) + firebase-admin. Cover:
  - `bulkOnboardOrgs('net-1', [{orgName:'First Baptist', adminEmail:'p@fb.org'}, {orgName:'Grace', adminEmail:'a@grace.org'}])` → creates 2 org docs (each with `network_id:'net-1'`, `billing_status:'trialing'`, a slug) + 2 invitation docs (role 'owner', the given email); returns 2 results each with `slug` + `inviteToken` + `status:'created'`.
  - Unique slug: when `getOrgBySlug` (the slug lookup query) returns an existing org for the base slug, the new org's slug gets a `-2` suffix. (Mock the orgs `where('slug','==').limit(1).get()` to return non-empty for the base slug, empty for `-2`.)
  - A row with a pre-existing `error` (from parsing) or blank name is skipped/returned as an error result without creating an org.
  Design the firebase-admin mock so: `adminDb.collection('orgs').doc()` → new org ref with `.set` + `.collection('invitations').doc(token).set`; `adminDb.collection('orgs').where('slug','==',s).limit(1).get()` → the slug-existence check.

- [ ] **Step 2: run → FAIL.**

- [ ] **Step 3: add to `actions/networks.ts`** — imports: `import { buildInviteToken } from '@/lib/tokens'`, `import type { OrgInvitation, OrgRole } from '@/lib/types'`, `import { slugify } from '@/lib/slug'` (likely already imported), and `import type { OnboardRow } from '@/lib/bulk-onboard'`. Append:
```typescript
export interface BulkOnboardResult {
  orgName: string
  adminEmail: string
  slug?: string
  inviteToken?: string
  status: 'created' | 'error'
  error?: string
}

// Unique org slug: append -2, -3, ... until free (createOrg does NOT dedupe slugs).
async function uniqueOrgSlug(name: string): Promise<string> {
  const base = slugify(name)
  let slug = base
  let n = 2
  while (!(await adminDb.collection('orgs').where('slug', '==', slug).limit(1).get()).empty) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

// Create an org + owner invitation per row, auto-linked to the network. The network admin
// is NOT made a member; the invited admin becomes owner on accepting. Returns per-row results.
export async function bulkOnboardOrgs(networkId: string, rows: OnboardRow[]): Promise<BulkOnboardResult[]> {
  await assertNetworkAdmin(networkId)
  const results: BulkOnboardResult[] = []
  for (const row of rows) {
    if (row.error || !row.orgName.trim() || !row.adminEmail.trim()) {
      results.push({ orgName: row.orgName, adminEmail: row.adminEmail, status: 'error', error: row.error ?? 'Invalid row' })
      continue
    }
    try {
      const slug = await uniqueOrgSlug(row.orgName)
      const orgRef = adminDb.collection('orgs').doc()
      const now = new Date().toISOString()
      await orgRef.set({
        id: orgRef.id,
        name: row.orgName.trim(),
        slug,
        billing_status: 'trialing',
        network_id: networkId,
        created_at: now,
      })
      const token = buildInviteToken()
      const invitation: OrgInvitation = {
        token,
        email: row.adminEmail.trim(),
        role: 'owner' as OrgRole,
        created_at: now,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }
      await orgRef.collection('invitations').doc(token).set(invitation)
      results.push({ orgName: row.orgName, adminEmail: row.adminEmail, slug, inviteToken: token, status: 'created' })
    } catch (err: unknown) {
      results.push({ orgName: row.orgName, adminEmail: row.adminEmail, status: 'error', error: err instanceof Error ? err.message : 'Failed' })
    }
  }
  return results
}
```
NOTE: `new Date(Date.now() + ...)` — `Date.now()` is unavailable in workflow scripts but FINE in normal app/server-action code; this is a server action, so it's allowed. The slug-existence query is single-field `where('slug','==')` (no index). Processing is sequential so intra-batch duplicate names get distinct slugs.

- [ ] **Step 4: run → PASS.** `npx tsc --noEmit && npx vitest run` green.

- [ ] **Step 5: commit**
```bash
git add actions/networks.ts "__tests__/actions/networks.test.ts"
git commit -m "feat: bulkOnboardOrgs — create member orgs + owner invitations from a network admin (unique slugs)"
```

---

## Task 3: bulk-onboard page + UI + nav

**Files:** Create `app/(network)/network/[networkSlug]/onboard/page.tsx`, `components/network/BulkOnboardClient.tsx`; modify `app/(network)/network/[networkSlug]/layout.tsx` (nav).

- [ ] **Step 1: nav** — in `app/(network)/network/[networkSlug]/layout.tsx`, add an "Onboard orgs" link in the `<nav>` (after "Shared templates"):
```tsx
<a href={`/network/${networkSlug}/onboard`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Onboard orgs</a>
```

- [ ] **Step 2: page** — `app/(network)/network/[networkSlug]/onboard/page.tsx`:
```tsx
export const dynamic = 'force-dynamic'

import { requireNetworkAdmin } from '@/lib/auth/guards'
import { BulkOnboardClient } from '@/components/network/BulkOnboardClient'

export default async function OnboardPage({ params }: { params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { networkId } = await requireNetworkAdmin(networkSlug)
  return <BulkOnboardClient networkId={networkId} />
}
```

- [ ] **Step 3: client** — `components/network/BulkOnboardClient.tsx`. `'use client'`. Props `{ networkId: string }`. Flow:
  - A `<textarea>` for pasting rows + helper text: "One per line: Organization Name, admin@email".
  - A **Preview** derived live from `parseOnboardRows(text)` (import from `@/lib/bulk-onboard`): show a small table of parsed rows with a red error note on invalid ones; show counts ("N valid, M with errors").
  - An **Onboard** button (disabled if no valid rows or while submitting) calling `bulkOnboardOrgs(networkId, parseOnboardRows(text))`. On success, render the `BulkOnboardResult[]`: per created row show org name + slug + a copyable accept link built as `${window.location.origin}/accept-invite?token=${r.inviteToken}` (a read-only `<input>` + a "Copy" button using `navigator.clipboard.writeText`), and per error row show the message. Surface a summary ("Created N orgs, M errors").
  - Keep it simple; `aria-live` for the submit error/summary. Imports: `useState`, `useMemo`, `parseOnboardRows`/`OnboardRow`, `bulkOnboardOrgs`/`BulkOnboardResult` (from `@/actions/networks`), UI primitives (Button/Input/Label/Card/Badge).

- [ ] **Step 4: verify + build + commit**
`npx tsc --noEmit && npx vitest run` → tsc clean, all pass (no new tests).
```bash
cp /Users/rm/vw/traxevent/.env.local .env.local 2>/dev/null || true
npx next build && echo BUILD_OK
rm -f .env.local
```
Expect BUILD_OK + `/network/[networkSlug]/onboard` route emits.
```bash
git add "app/(network)/network/[networkSlug]/onboard/page.tsx" components/network/BulkOnboardClient.tsx "app/(network)/network/[networkSlug]/layout.tsx"
git commit -m "feat: network bulk-onboard page — paste orgs, create + invite admins, surface accept links"
```

---

## Task 4: final verification

- [ ] **Step 1:** `npx tsc --noEmit && npx vitest run` green.
- [ ] **Step 2: build** (with env): `cp /Users/rm/vw/traxevent/.env.local .env.local; npx next build && echo BUILD_OK; rm -f .env.local`. Confirm `/network/[networkSlug]/onboard` emits.
- [ ] **Step 3: security spot-check** — `bulkOnboardOrgs` is `assertNetworkAdmin(networkId)`-gated; created orgs get `network_id: networkId` (auto-linked to the calling network only); invitations are role `owner` for the provided email; the network admin is NOT added as a member. The slug query is single-field `where('slug','==')` (no index). Confirm.
- [ ] **Step 4: collision spot-check** — duplicate org names within one batch get distinct slugs (sequential processing + `uniqueOrgSlug` re-checks after each write). Confirm.

---

## Self-Review Checklist
- [x] Pure `parseOnboardRows` (email = last token; per-row errors) + tests
- [x] `bulkOnboardOrgs` creates org (network_id, unique slug) + owner invitation per valid row; error rows skipped with a message; `assertNetworkAdmin`-gated
- [x] No org-slug overwrite (unique-slug loop); no new Firestore index
- [x] Network "Onboard orgs" page: paste → preview → submit → results with copyable accept links; `next build` green

**Deferred:** auto-emailing invitations; CSV upload; resend/revoke invites; auto-pushing shared templates to the new orgs (use 4b after they accept).

**Security note:** the orgs created are auto-linked to the calling network only (`network_id = networkId`); the network admin gains no membership in them. Each org is owner-less until its invited admin accepts (the org's admin pages remain inaccessible until then — the existing org layout guard requires membership). The accept link is a 16-byte random token, single-use (acceptInvitation marks `accepted_at`) with a 7-day expiry.
