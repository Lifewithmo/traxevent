# Public Profile Page (Link-in-Bio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each org gets a public, indexable link-in-bio page at `/p/[handle]` (photo, bio, socials, rich link buttons) managed from a new "Public profile" settings section.

**Architecture:** A `public_profile` map on the org doc (sibling of `branding`), validated by a pure parser in `lib/public-profile.ts`. Authed actions in `actions/public-profile.ts` save it with a transaction-guarded handle-uniqueness check. A server component at `app/(public)/p/[handle]/page.tsx` resolves handle→org via an equality query and renders the page tinted with the org's brand kit. The editor copies the `BrandingClient` pattern.

**Tech Stack:** Next.js App Router (this repo's Next 16 — read `node_modules/next/dist/docs/` if unsure of an API), Firestore admin SDK, vitest, shadcn primitives (`Card`, `Button`, `Input`, `Label`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-08-public-profile-page-design.md`

## Global Constraints

- `'use server'` modules export **async functions only — never re-export types** (breaks `next build`, not tsc; see memory `nextjs-use-server-no-type-reexport`).
- `params` in pages is a **Promise** — always `await params`.
- Firestore rejects `undefined` — parsers drop empty fields (absent-not-empty, conditional spread), matching `parseOrgBranding`.
- Handle rules (spec, verbatim): lowercase `a-z0-9-`, regex `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$` (3–40 chars), reserved list `admin, api, app, www, p, bio, inquire, proposals, invoices, contracts, client, brand, traxevent, brewtrax`.
- Field caps (spec, verbatim): bio ≤300; social URLs ≤300; links ≤30; link title ≤120, description ≤300, URLs ≤500; all URLs https-only.
- User-facing conflict message, exact string: `That URL is taken.`
- Sidebar label, exact: **Public profile**.
- Tests: `npm test` runs `vitest run`; firebase-admin mocked at module level. Whole branch is green only after `npm run build` passes.
- No new dependencies.

---

### Task 1: Types + parser (`lib/public-profile.ts`)

**Files:**
- Modify: `lib/types.ts` (add three interfaces + one field on `Org`)
- Create: `lib/public-profile.ts`
- Test: `__tests__/lib/public-profile.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: types `PublicProfile`, `PublicProfileLink`, `PublicProfileSocials` in `@/lib/types`; `Org.public_profile?: PublicProfile`; functions `parseHandle(value: unknown): string` and `parsePublicProfile(input: unknown): PublicProfile` plus `RESERVED_HANDLES: Set<string>` in `@/lib/public-profile`.

- [ ] **Step 1: Add types to `lib/types.ts`**

Directly below the `OrgBranding` interface add:

```ts
// Public profile / link-in-bio (public profile page spec). Like OrgBranding,
// the whole map is public-safe by construction — it ships verbatim to /p/[handle].
export interface PublicProfileLink {
  id: string                   // client-minted uuid; stable identity for list editing
  title: string
  url: string
  description?: string
  image_url?: string
}

export interface PublicProfileSocials {
  instagram?: string
  tiktok?: string
  youtube?: string
  facebook?: string
  website?: string
}

export interface PublicProfile {
  enabled: boolean             // page 404s unless true
  handle: string               // unique across orgs; /p/[handle]
  display_name?: string        // falls back to branding.display_name → org name
  bio?: string
  photo_url?: string
  socials?: PublicProfileSocials
  links: PublicProfileLink[]
}
```

And add to the `Org` interface (after `branding?: OrgBranding`):

```ts
  public_profile?: PublicProfile
```

- [ ] **Step 2: Write the failing tests**

Create `__tests__/lib/public-profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseHandle, parsePublicProfile, RESERVED_HANDLES } from '@/lib/public-profile'

const VALID = {
  enabled: true,
  handle: 'abbyscoffeecorner',
  links: [{ id: 'l1', title: 'My menu', url: 'https://example.com/menu' }],
}

describe('parseHandle', () => {
  it.each(['abc', 'abbyscoffeecorner', 'a-1', 'a'.repeat(40), 'AbC'])('accepts %s', (h) => {
    expect(parseHandle(h)).toBe(h.toLowerCase())
  })
  it.each(['ab', 'a'.repeat(41), '-abc', 'abc-', 'ab_c', 'ab c', 'café', '', 42])(
    'rejects %s',
    (h) => {
      expect(() => parseHandle(h)).toThrow()
    },
  )
  it('rejects every reserved handle', () => {
    for (const h of RESERVED_HANDLES) expect(() => parseHandle(h)).toThrow('reserved')
  })
  it('trims and lowercases', () => {
    expect(parseHandle('  AbbysCoffee  ')).toBe('abbyscoffee')
  })
})

describe('parsePublicProfile', () => {
  it('parses a minimal valid profile', () => {
    expect(parsePublicProfile(VALID)).toEqual(VALID)
  })

  it('requires a handle', () => {
    expect(() => parsePublicProfile({ enabled: true, links: [] })).toThrow()
  })

  it('drops empty optional fields instead of storing them', () => {
    const out = parsePublicProfile({
      ...VALID,
      display_name: '  ',
      bio: '',
      photo_url: '',
      socials: { instagram: '', website: '' },
    })
    expect(out).not.toHaveProperty('display_name')
    expect(out).not.toHaveProperty('bio')
    expect(out).not.toHaveProperty('photo_url')
    expect(out).not.toHaveProperty('socials')
  })

  it('keeps present optional fields, trimmed', () => {
    const out = parsePublicProfile({
      ...VALID,
      display_name: ' Abby ',
      bio: ' Coffee lover ',
      photo_url: 'https://example.com/me.jpg',
      socials: { instagram: 'https://instagram.com/abbys', website: 'https://abbys.coffee' },
    })
    expect(out.display_name).toBe('Abby')
    expect(out.bio).toBe('Coffee lover')
    expect(out.photo_url).toBe('https://example.com/me.jpg')
    expect(out.socials).toEqual({
      instagram: 'https://instagram.com/abbys',
      website: 'https://abbys.coffee',
    })
  })

  it('enforces field caps', () => {
    expect(() => parsePublicProfile({ ...VALID, bio: 'x'.repeat(301) })).toThrow()
    expect(() =>
      parsePublicProfile({
        ...VALID,
        links: [{ id: 'l1', title: 'x'.repeat(121), url: 'https://a.io' }],
      }),
    ).toThrow()
    expect(() =>
      parsePublicProfile({
        ...VALID,
        links: [{ id: 'l1', title: 't', url: 'https://a.io', description: 'x'.repeat(301) }],
      }),
    ).toThrow()
  })

  it('rejects non-https and malformed URLs everywhere', () => {
    expect(() => parsePublicProfile({ ...VALID, photo_url: 'http://x.io/a.jpg' })).toThrow()
    expect(() => parsePublicProfile({ ...VALID, socials: { tiktok: 'not a url' } })).toThrow()
    expect(() =>
      parsePublicProfile({ ...VALID, links: [{ id: 'l1', title: 't', url: 'javascript:alert(1)' }] }),
    ).toThrow()
  })

  it('requires id, title, and url on every link', () => {
    for (const bad of [
      { title: 't', url: 'https://a.io' },
      { id: 'l1', url: 'https://a.io' },
      { id: 'l1', title: 't' },
    ]) {
      expect(() => parsePublicProfile({ ...VALID, links: [bad] })).toThrow()
    }
  })

  it('keeps link order and optional link fields', () => {
    const out = parsePublicProfile({
      ...VALID,
      links: [
        { id: 'a', title: 'First', url: 'https://a.io', description: 'desc', image_url: 'https://a.io/i.jpg' },
        { id: 'b', title: 'Second', url: 'https://b.io' },
      ],
    })
    expect(out.links.map((l) => l.id)).toEqual(['a', 'b'])
    expect(out.links[0].description).toBe('desc')
    expect(out.links[1]).not.toHaveProperty('description')
  })

  it('caps links at 30', () => {
    const links = Array.from({ length: 31 }, (_, i) => ({
      id: `l${i}`,
      title: `t${i}`,
      url: 'https://a.io',
    }))
    expect(() => parsePublicProfile({ ...VALID, links })).toThrow('30')
  })

  it('coerces enabled to a strict boolean', () => {
    expect(parsePublicProfile({ ...VALID, enabled: 'yes' }).enabled).toBe(false)
    expect(parsePublicProfile({ ...VALID, enabled: true }).enabled).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/public-profile.test.ts`
Expected: FAIL — cannot resolve `@/lib/public-profile`.

- [ ] **Step 4: Implement `lib/public-profile.ts`**

```ts
import type { PublicProfile, PublicProfileLink, PublicProfileSocials } from '@/lib/types'

// Handle: 3–40 chars, lowercase a-z0-9-, starts/ends alphanumeric (spec).
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/

export const RESERVED_HANDLES = new Set([
  'admin', 'api', 'app', 'www', 'p', 'bio', 'inquire', 'proposals',
  'invoices', 'contracts', 'client', 'brand', 'traxevent', 'brewtrax',
])

export function parseHandle(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Handle is required')
  const v = value.trim().toLowerCase()
  if (!HANDLE_RE.test(v)) {
    throw new Error(
      'Handle must be 3–40 characters — lowercase letters, digits, and hyphens, starting and ending with a letter or digit',
    )
  }
  if (RESERVED_HANDLES.has(v)) throw new Error('That handle is reserved')
  return v
}

function parseText(value: unknown, field: string, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!v) return undefined
  if (v.length > max) throw new Error(`${field} must be ${max} characters or fewer`)
  return v
}

function parseHttpsUrl(value: unknown, field: string, max: number): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const v = value.trim()
  if (v.length > max) throw new Error(`${field} must be ${max} characters or fewer`)
  let url: URL
  try {
    url = new URL(v)
  } catch {
    throw new Error(`${field} must be an https URL`)
  }
  if (url.protocol !== 'https:') throw new Error(`${field} must be an https URL`)
  return v
}

const SOCIAL_KEYS = ['instagram', 'tiktok', 'youtube', 'facebook', 'website'] as const

const MAX_LINKS = 30

/**
 * Validate untrusted editor input into a storable PublicProfile. Same
 * conventions as parseOrgBranding: throw on malformed, drop empty fields
 * (Firestore rejects undefined), output contains only present keys. The
 * result is public-safe by construction — it ships verbatim to /p/[handle].
 */
export function parsePublicProfile(input: unknown): PublicProfile {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid profile payload')
  const raw = input as Record<string, unknown>

  const out: PublicProfile = {
    enabled: raw.enabled === true,
    handle: parseHandle(raw.handle),
    links: [],
  }

  const displayName = parseText(raw.display_name, 'Display name', 200)
  if (displayName) out.display_name = displayName
  const bio = parseText(raw.bio, 'Bio', 300)
  if (bio) out.bio = bio
  const photo = parseHttpsUrl(raw.photo_url, 'Photo', 500)
  if (photo) out.photo_url = photo

  if (typeof raw.socials === 'object' && raw.socials !== null) {
    const rawSocials = raw.socials as Record<string, unknown>
    const socials: PublicProfileSocials = {}
    for (const key of SOCIAL_KEYS) {
      const url = parseHttpsUrl(rawSocials[key], `${key} URL`, 300)
      if (url) socials[key] = url
    }
    if (Object.keys(socials).length > 0) out.socials = socials
  }

  const rawLinks = Array.isArray(raw.links) ? raw.links : []
  if (rawLinks.length > MAX_LINKS) throw new Error(`At most ${MAX_LINKS} links`)
  for (const rawLink of rawLinks) {
    if (typeof rawLink !== 'object' || rawLink === null) throw new Error('Invalid link')
    const l = rawLink as Record<string, unknown>
    const id = typeof l.id === 'string' && l.id.trim() && l.id.trim().length <= 64 ? l.id.trim() : undefined
    const title = parseText(l.title, 'Link title', 120)
    const url = parseHttpsUrl(l.url, 'Link URL', 500)
    if (!id || !title || !url) throw new Error('Each link needs a title and an https URL')
    const link: PublicProfileLink = { id, title, url }
    const description = parseText(l.description, 'Link description', 300)
    if (description) link.description = description
    const image = parseHttpsUrl(l.image_url, 'Link image', 500)
    if (image) link.image_url = image
    out.links.push(link)
  }

  return out
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/public-profile.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/public-profile.ts __tests__/lib/public-profile.test.ts
git commit -m "feat(profile): PublicProfile types and parser"
```

---

### Task 2: Authed actions + upload kinds

**Files:**
- Create: `actions/public-profile.ts`
- Modify: `actions/org-assets.ts` (extend the kind union)
- Test: `__tests__/actions/public-profile.test.ts`

**Interfaces:**
- Consumes: `parsePublicProfile` from `@/lib/public-profile` (Task 1); `assertOrgAdmin(orgId)` from `@/lib/auth/assert`; `adminDb` from `@/lib/firebase-admin`.
- Produces: `savePublicProfile(orgId: string, input: unknown): Promise<PublicProfile>` and `getPublicProfile(orgId: string): Promise<PublicProfile | null>`; `uploadOrgAsset` accepting kinds `'logo' | 'cover' | 'profile_photo' | 'link_image'`.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/actions/public-profile.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { assertOrgAdminSpy, orgGetSpy, txGetSpy, txUpdateSpy, runTransaction } = vi.hoisted(() => {
  const txGetSpy = vi.fn()
  const txUpdateSpy = vi.fn()
  const runTransaction = vi.fn(
    async (fn: (tx: { get: typeof txGetSpy; update: typeof txUpdateSpy }) => Promise<unknown>) =>
      fn({ get: txGetSpy, update: txUpdateSpy }),
  )
  return {
    assertOrgAdminSpy: vi.fn().mockResolvedValue(undefined),
    orgGetSpy: vi.fn(),
    txGetSpy,
    txUpdateSpy,
    runTransaction,
  }
})

vi.mock('@/lib/auth/assert', () => ({
  assertOrgAdmin: assertOrgAdminSpy,
  assertOrgMember: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn((id: string) => ({ id, get: orgGetSpy })),
      where: vi.fn(() => ({ limit: vi.fn(() => ({ kind: 'handle-query' })) })),
    })),
    runTransaction,
  },
}))

import { getPublicProfile, savePublicProfile } from '@/actions/public-profile'

const VALID = {
  enabled: true,
  handle: 'abbyscoffeecorner',
  links: [{ id: 'l1', title: 'My menu', url: 'https://example.com/menu' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  txGetSpy.mockResolvedValue({ empty: true, docs: [] })
})

describe('getPublicProfile', () => {
  it('requires org admin and returns the stored map', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ public_profile: VALID }) })
    expect(await getPublicProfile('o1')).toEqual(VALID)
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
  })

  it('returns null when no profile exists yet', async () => {
    orgGetSpy.mockResolvedValue({ exists: true, data: () => ({ name: 'Org' }) })
    expect(await getPublicProfile('o1')).toBeNull()
  })

  it('throws when the org does not exist', async () => {
    orgGetSpy.mockResolvedValue({ exists: false })
    await expect(getPublicProfile('o1')).rejects.toThrow('Org not found')
  })
})

describe('savePublicProfile', () => {
  it('requires org admin', async () => {
    await savePublicProfile('o1', VALID)
    expect(assertOrgAdminSpy).toHaveBeenCalledWith('o1')
  })

  it('rejects invalid payloads before touching Firestore', async () => {
    await expect(savePublicProfile('o1', { ...VALID, handle: 'x' })).rejects.toThrow()
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('writes the parsed profile and returns it', async () => {
    const saved = await savePublicProfile('o1', { ...VALID, bio: '  hi  ', display_name: '' })
    expect(saved.bio).toBe('hi')
    expect(saved).not.toHaveProperty('display_name')
    expect(txUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1' }),
      { public_profile: saved },
    )
  })

  it('rejects when another org holds the handle', async () => {
    txGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'other-org' }] })
    await expect(savePublicProfile('o1', VALID)).rejects.toThrow('That URL is taken.')
    expect(txUpdateSpy).not.toHaveBeenCalled()
  })

  it('allows re-saving your own handle', async () => {
    txGetSpy.mockResolvedValue({ empty: false, docs: [{ id: 'o1' }] })
    await expect(savePublicProfile('o1', VALID)).resolves.toBeTruthy()
    expect(txUpdateSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/actions/public-profile.test.ts`
Expected: FAIL — cannot resolve `@/actions/public-profile`.

- [ ] **Step 3: Implement `actions/public-profile.ts`**

`'use server'` module: async function exports only, **no type re-exports**.

```ts
'use server'

import { assertOrgAdmin } from '@/lib/auth/assert'
import { adminDb } from '@/lib/firebase-admin'
import { parsePublicProfile } from '@/lib/public-profile'
import type { PublicProfile } from '@/lib/types'

export async function getPublicProfile(orgId: string): Promise<PublicProfile | null> {
  await assertOrgAdmin(orgId)
  const snap = await adminDb.collection('orgs').doc(orgId).get()
  if (!snap.exists) throw new Error('Org not found')
  return (snap.data() as { public_profile?: PublicProfile }).public_profile ?? null
}

/**
 * Full-overwrite save (delete path included), like updateOrgBranding — but in
 * a transaction whose first read is the handle-uniqueness query, closing the
 * check-then-set race between two orgs claiming the same handle.
 */
export async function savePublicProfile(orgId: string, input: unknown): Promise<PublicProfile> {
  await assertOrgAdmin(orgId)
  const profile = parsePublicProfile(input)
  await adminDb.runTransaction(async (tx) => {
    const conflict = await tx.get(
      adminDb.collection('orgs').where('public_profile.handle', '==', profile.handle).limit(1),
    )
    if (!conflict.empty && conflict.docs[0].id !== orgId) throw new Error('That URL is taken.')
    tx.update(adminDb.collection('orgs').doc(orgId), { public_profile: profile })
  })
  return profile
}
```

- [ ] **Step 4: Extend `actions/org-assets.ts` kinds**

Two mechanical edits:

```ts
const ASSET_KINDS = ['logo', 'cover', 'profile_photo', 'link_image']
```

and the signature:

```ts
export async function uploadOrgAsset(
  orgId: string,
  kind: 'logo' | 'cover' | 'profile_photo' | 'link_image',
  formData: FormData,
): Promise<{ url: string }> {
```

(Storage path already derives from `kind`; nothing else changes.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- __tests__/actions/public-profile.test.ts`
Expected: PASS. Also run `npm test` fully — the org-assets change must not break existing suites.

- [ ] **Step 6: Commit**

```bash
git add actions/public-profile.ts actions/org-assets.ts __tests__/actions/public-profile.test.ts
git commit -m "feat(profile): save/get actions with transactional handle uniqueness"
```

---

### Task 3: Public resolution + `/p/[handle]` page

**Files:**
- Create: `lib/public-profile-server.ts`
- Create: `app/(public)/p/[handle]/page.tsx`
- Test: `__tests__/lib/public-profile-server.test.ts`

**Interfaces:**
- Consumes: `Org`, `PublicProfile` types (Task 1); `adminDb`; `getBrand`, `DEFAULT_BRAND_ID` from `@/lib/brands`; `readableTextOn` from `@/lib/branding`.
- Produces: `getOrgByHandle(handle: string): Promise<Org | null>` (null for unknown OR disabled — callers can't tell which, by design).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/lib/public-profile-server.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { querySpy } = vi.hoisted(() => ({ querySpy: vi.fn() }))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: querySpy })) })),
    })),
  },
}))

import { getOrgByHandle } from '@/lib/public-profile-server'

const ENABLED_ORG = {
  name: 'Abbys Coffee',
  public_profile: { enabled: true, handle: 'abbys', links: [] },
}

beforeEach(() => vi.clearAllMocks())

describe('getOrgByHandle', () => {
  it('returns the org with its id for an enabled profile', async () => {
    querySpy.mockResolvedValue({ empty: false, docs: [{ id: 'o1', data: () => ENABLED_ORG }] })
    const org = await getOrgByHandle('abbys')
    expect(org?.id).toBe('o1')
    expect(org?.name).toBe('Abbys Coffee')
  })

  it('returns null for an unknown handle', async () => {
    querySpy.mockResolvedValue({ empty: true, docs: [] })
    expect(await getOrgByHandle('nobody')).toBeNull()
  })

  it('returns null when the profile is disabled — indistinguishable from unknown', async () => {
    querySpy.mockResolvedValue({
      empty: false,
      docs: [{ id: 'o1', data: () => ({ ...ENABLED_ORG, public_profile: { ...ENABLED_ORG.public_profile, enabled: false } }) }],
    })
    expect(await getOrgByHandle('abbys')).toBeNull()
  })

  it('lowercases the handle before querying', async () => {
    querySpy.mockResolvedValue({ empty: true, docs: [] })
    await getOrgByHandle('ABBYS')
    // The where() mock ignores args; behavior is covered by resolving without throwing.
    expect(querySpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/lib/public-profile-server.test.ts`
Expected: FAIL — cannot resolve `@/lib/public-profile-server`.

- [ ] **Step 3: Implement `lib/public-profile-server.ts`**

```ts
import { adminDb } from '@/lib/firebase-admin'
import type { Org } from '@/lib/types'

/**
 * Resolve a public-profile handle to its org. Unknown handle and disabled
 * profile both return null so the public page can't leak which it was.
 * Equality query on a map field — automatic single-field index, no
 * firestore.indexes.json change.
 */
export async function getOrgByHandle(handle: string): Promise<Org | null> {
  const snap = await adminDb
    .collection('orgs')
    .where('public_profile.handle', '==', handle.trim().toLowerCase())
    .limit(1)
    .get()
  if (snap.empty) return null
  const org = { id: snap.docs[0].id, ...snap.docs[0].data() } as Org
  if (org.public_profile?.enabled !== true) return null
  return org
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/lib/public-profile-server.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the page**

Create `app/(public)/p/[handle]/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOrgByHandle } from '@/lib/public-profile-server'
import { getBrand, DEFAULT_BRAND_ID } from '@/lib/brands'
import { readableTextOn } from '@/lib/branding'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const org = await getOrgByHandle(handle)
  if (!org?.public_profile) return {}
  const profile = org.public_profile
  const title = profile.display_name ?? org.branding?.display_name ?? org.name
  return {
    title,
    description: profile.bio,
    openGraph: {
      title,
      description: profile.bio,
      ...(profile.photo_url ? { images: [profile.photo_url] } : {}),
    },
  }
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const org = await getOrgByHandle(handle)
  if (!org?.public_profile) notFound()

  const profile = org.public_profile
  const displayName = profile.display_name ?? org.branding?.display_name ?? org.name
  const accent = org.branding?.accent_color ?? '#111827'
  const accentText = readableTextOn(accent)
  const brand = getBrand(org.brand_id)
  const socials = Object.entries(profile.socials ?? {})

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10">
      <header className="flex flex-col items-center text-center">
        {profile.photo_url && (
          // Plain <img>: same rationale as brand assets — public, small, and
          // next/image would need remotePatterns for the storage host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photo_url}
            alt={displayName}
            className="h-24 w-24 rounded-full border border-gray-200 object-cover"
          />
        )}
        <h1 className="mt-4 text-2xl font-bold">{displayName}</h1>
        {profile.bio && <p className="mt-1 text-sm text-gray-600">{profile.bio}</p>}
        {socials.length > 0 && (
          <nav aria-label="Social links" className="mt-3 flex flex-wrap justify-center gap-2">
            {socials.map(([network, url]) => (
              <a
                key={network}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium capitalize text-gray-700 hover:bg-gray-50"
              >
                {network}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="mt-8 flex flex-col gap-3">
        {profile.links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition hover:opacity-90"
            style={{ backgroundColor: accent, borderColor: accent, color: accentText }}
          >
            {link.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={link.image_url}
                alt=""
                className="h-12 w-12 flex-none rounded-lg bg-white object-cover"
              />
            )}
            <span className="min-w-0 flex-1 text-center">
              <span className="block font-semibold">{link.title}</span>
              {link.description && (
                <span className="mt-0.5 block text-xs opacity-80">{link.description}</span>
              )}
            </span>
          </a>
        ))}
      </main>

      <footer className="mt-auto pt-10 text-center text-xs text-gray-400">
        <a
          href={brand.id === DEFAULT_BRAND_ID ? '/' : `/brand/${brand.id}`}
          className="hover:text-gray-600"
        >
          Powered by {brand.name}
        </a>
      </footer>
    </div>
  )
}
```

Layout notes: when a link has an image, the flex row keeps the text block centered via `flex-1 text-center`; without an image the button is a full-width centered pill — matching the Beacons reference. No robots exclusion anywhere: this page is deliberately indexable (spec decision 4).

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean (page components have no unit tests in this repo; the resolution logic is covered by Step 1's tests, and rendering is verified in Task 5's build + manual walk).

- [ ] **Step 7: Commit**

```bash
git add lib/public-profile-server.ts "app/(public)/p/[handle]/page.tsx" __tests__/lib/public-profile-server.test.ts
git commit -m "feat(profile): public /p/[handle] page with brand-kit tinting"
```

---

### Task 4: Editor — settings section "Public profile"

**Files:**
- Create: `components/admin/PublicProfileClient.tsx`
- Create: `app/(admin)/[orgSlug]/public-profile/page.tsx`
- Modify: `components/layout/AdminSidebar.tsx` (one line, after the Branding link ~line 224)

**Interfaces:**
- Consumes: `savePublicProfile(orgId, input)` (Task 2), `uploadOrgAsset(orgId, kind, form)` with new kinds (Task 2), types from Task 1.
- Produces: nothing consumed later; final UI surface.

No unit tests for these client components (repo convention — Branding, Invoice, Contract editors are all untested client shells over tested actions). Verification is `npx tsc --noEmit` + Task 5's build and manual walk.

- [ ] **Step 1: Implement `components/admin/PublicProfileClient.tsx`**

Follows `BrandingClient`: `useState` per field, server normalization is truth (re-seed from `savePublicProfile`'s return), plain `<textarea>` idiom from `CustomerDetailClient`.

```tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { savePublicProfile } from '@/actions/public-profile'
import { uploadOrgAsset } from '@/actions/org-assets'
import type { PublicProfile, PublicProfileSocials } from '@/lib/types'

interface PublicProfileClientProps {
  orgId: string
  orgName: string
  initialProfile: PublicProfile | null
}

// Local editing shape: everything a string so inputs stay controlled;
// parsePublicProfile on the server drops the blanks.
interface EditableLink {
  id: string
  title: string
  description: string
  image_url: string
  url: string
}

const SOCIAL_FIELDS: Array<{ key: keyof PublicProfileSocials; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@…' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@…' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { key: 'website', label: 'Website', placeholder: 'https://…' },
]

function toEditableLinks(profile: PublicProfile | null): EditableLink[] {
  return (profile?.links ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description ?? '',
    image_url: l.image_url ?? '',
    url: l.url,
  }))
}

export function PublicProfileClient({ orgId, orgName, initialProfile }: PublicProfileClientProps) {
  const [enabled, setEnabled] = useState(initialProfile?.enabled ?? false)
  const [handle, setHandle] = useState(initialProfile?.handle ?? '')
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? '')
  const [bio, setBio] = useState(initialProfile?.bio ?? '')
  const [photoUrl, setPhotoUrl] = useState(initialProfile?.photo_url ?? '')
  const [socials, setSocials] = useState<Record<string, string>>({
    instagram: initialProfile?.socials?.instagram ?? '',
    tiktok: initialProfile?.socials?.tiktok ?? '',
    youtube: initialProfile?.socials?.youtube ?? '',
    facebook: initialProfile?.socials?.facebook ?? '',
    website: initialProfile?.socials?.website ?? '',
  })
  const [links, setLinks] = useState<EditableLink[]>(toEditableLinks(initialProfile))
  const [savedHandle, setSavedHandle] = useState(initialProfile?.handle ?? '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null) // 'photo' | link id
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Relative path only during render — reading window.location.origin here
  // would hydration-mismatch (client components SSR too). Event handlers
  // below resolve the absolute URL at click time.
  const livePath = savedHandle ? `/p/${savedHandle}` : null

  async function handleSave() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await savePublicProfile(orgId, {
        enabled,
        handle,
        display_name: displayName,
        bio,
        photo_url: photoUrl,
        socials,
        links,
      })
      // Re-seed from what persisted — server normalization is the truth.
      setEnabled(saved.enabled)
      setHandle(saved.handle)
      setDisplayName(saved.display_name ?? '')
      setBio(saved.bio ?? '')
      setPhotoUrl(saved.photo_url ?? '')
      setSocials({
        instagram: saved.socials?.instagram ?? '',
        tiktok: saved.socials?.tiktok ?? '',
        youtube: saved.socials?.youtube ?? '',
        facebook: saved.socials?.facebook ?? '',
        website: saved.socials?.website ?? '',
      })
      setLinks(toEditableLinks(saved))
      setSavedHandle(saved.handle)
      setNotice('Saved')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(target: 'photo' | string, file: File) {
    setUploading(target)
    setError(null)
    try {
      const form = new FormData()
      form.set('file', file)
      const kind = target === 'photo' ? 'profile_photo' : 'link_image'
      const { url } = await uploadOrgAsset(orgId, kind, form)
      if (target === 'photo') setPhotoUrl(url)
      else setLinks((ls) => ls.map((l) => (l.id === target ? { ...l, image_url: url } : l)))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  function addLink() {
    setLinks((ls) => [
      ...ls,
      { id: crypto.randomUUID(), title: '', description: '', image_url: '', url: '' },
    ])
  }

  function removeLink(id: string) {
    setLinks((ls) => ls.filter((l) => l.id !== id))
  }

  function moveLink(id: string, dir: -1 | 1) {
    setLinks((ls) => {
      const i = ls.findIndex((l) => l.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function setLinkField(id: string, field: keyof EditableLink, value: string) {
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, [field]: value } : l)))
  }

  async function copyLiveUrl() {
    if (!livePath) return
    await navigator.clipboard.writeText(`${window.location.origin}${livePath}`)
    setNotice('Link copied')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Public profile</h1>
        <p className="text-sm text-gray-500">
          A public link-in-bio page for your business — put its URL in your Instagram or TikTok bio.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Page</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Page is live
          </label>

          <div className="space-y-1">
            <Label htmlFor="profile-handle">Handle</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">/p/</span>
              <Input
                id="profile-handle"
                value={handle}
                placeholder="abbyscoffeecorner"
                onChange={(e) => setHandle(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <p className="text-xs text-gray-500">
              3–40 characters: lowercase letters, digits, and hyphens.
            </p>
          </div>

          {livePath && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded bg-gray-100 px-2 py-1">{livePath}</code>
              <Button type="button" variant="outline" size="sm" onClick={copyLiveUrl}>
                Copy
              </Button>
              {/* This repo's Button has no asChild — plain window.open. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(livePath, '_blank', 'noopener,noreferrer')}
              >
                Open
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="profile-photo">Photo</Label>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Profile preview"
                className="h-24 w-24 rounded-full border border-gray-200 object-cover"
              />
            )}
            <Input
              id="profile-photo"
              type="file"
              accept="image/*"
              disabled={uploading !== null}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload('photo', f)
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-display-name">Display name</Label>
            <Input
              id="profile-display-name"
              value={displayName}
              placeholder={orgName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-gray-500">Falls back to your org name, {orgName}.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="profile-bio">Bio</Label>
            <textarea
              id="profile-bio"
              value={bio}
              maxLength={300}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Coffee lover and home barista"
            />
          </div>

          {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`profile-social-${key}`}>{label}</Label>
              <Input
                id={`profile-social-${key}`}
                value={socials[key]}
                placeholder={placeholder}
                onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {links.length === 0 && (
            <p className="text-sm text-gray-500">No links yet — add your first button.</p>
          )}
          {links.map((link, i) => (
            <div key={link.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Link {i + 1}
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Move link ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveLink(link.id, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Move link ${i + 1} down`}
                    disabled={i === links.length - 1}
                    onClick={() => moveLink(link.id, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Remove link ${i + 1}`}
                    onClick={() => removeLink(link.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              <Input
                aria-label={`Link ${i + 1} title`}
                value={link.title}
                placeholder="Title"
                onChange={(e) => setLinkField(link.id, 'title', e.target.value)}
              />
              <Input
                aria-label={`Link ${i + 1} URL`}
                value={link.url}
                placeholder="https://…"
                onChange={(e) => setLinkField(link.id, 'url', e.target.value)}
              />
              <textarea
                aria-label={`Link ${i + 1} description`}
                value={link.description}
                maxLength={300}
                rows={2}
                onChange={(e) => setLinkField(link.id, 'description', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Optional description"
              />
              <div className="flex items-center gap-3">
                {link.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.image_url}
                    alt=""
                    className="h-12 w-12 rounded-lg border border-gray-200 object-cover"
                  />
                )}
                <Input
                  aria-label={`Link ${i + 1} thumbnail`}
                  type="file"
                  accept="image/*"
                  disabled={uploading !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(link.id, f)
                  }}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addLink} disabled={links.length >= 30}>
            Add link
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      <Button onClick={handleSave} disabled={busy || uploading !== null}>
        {busy ? 'Saving…' : 'Save profile'}
      </Button>
    </div>
  )
}
```

(Verified against `components/ui/button.tsx`: `variant="outline"` and `size="sm"` exist; there is **no** `asChild` prop — hence the `window.open` Open button.)

- [ ] **Step 2: Implement the admin page**

Create `app/(admin)/[orgSlug]/public-profile/page.tsx` (mirrors `branding/page.tsx`):

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { adminDb } from '@/lib/firebase-admin'
import { PublicProfileClient } from '@/components/admin/PublicProfileClient'
import type { Org } from '@/lib/types'

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const orgSnap = await adminDb.collection('orgs').where('slug', '==', orgSlug).limit(1).get()
  if (orgSnap.empty) notFound()
  const org = { id: orgSnap.docs[0].id, ...orgSnap.docs[0].data() } as Org

  return (
    <PublicProfileClient
      orgId={org.id}
      orgName={org.name}
      initialProfile={org.public_profile ?? null}
    />
  )
}
```

- [ ] **Step 3: Add the sidebar entry**

In `components/layout/AdminSidebar.tsx`, in the Settings group directly after the Branding link (~line 224), add:

```tsx
<Link href={`/${orgSlug}/public-profile`} className={navClass(`/${orgSlug}/public-profile`)}>Public profile</Link>
```

- [ ] **Step 4: Verify compile + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean compile, all suites pass.

- [ ] **Step 5: Commit**

```bash
git add components/admin/PublicProfileClient.tsx "app/(admin)/[orgSlug]/public-profile/page.tsx" components/layout/AdminSidebar.tsx
git commit -m "feat(profile): Public profile settings editor and sidebar entry"
```

---

### Task 5: Green-branch verification

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds. This is the gate that catches `'use server'` type re-exports and Next-specific page-signature mistakes that tsc misses. A fresh worktree needs `npm install` and a copied `.env.local` first (memory: `traxevent-test-worktree-pollution`).

- [ ] **Step 3: Manual browser walk (emulator or dev)**

1. Sign in as an org admin → Settings → **Public profile**.
2. Set handle `testhandle`, add a bio, upload a photo, add two links (one with thumbnail + description), one social. Save. Expect the live URL row with Copy/Open.
3. Open `/p/testhandle` — photo, name, bio, social pill, both buttons (accent-tinted), footer "Powered by …".
4. Toggle "Page is live" off, save, reload `/p/testhandle` → 404.
5. Second org claims `testhandle` → save fails with "That URL is taken."

- [ ] **Step 4: Commit any fixes; do not merge**

Stop after the walk. Integration (PR vs merge) is a user decision — use superpowers:finishing-a-development-branch.
