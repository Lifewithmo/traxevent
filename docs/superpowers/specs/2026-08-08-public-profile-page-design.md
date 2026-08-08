# Public profile page (link-in-bio) — design

Date: 2026-08-08
Status: approved

## Problem

A live customer wants to replace their Beacons link-in-bio page with a page
hosted on the platform. Instagram/TikTok allow one bio URL; creators point it
at a single mobile page holding everything — socials, affiliate links, booking.
Today the platform has no public org-level page at all: the public surface is
tokenized artifacts (proposals, invoices, contracts, portal) plus per-event
registration under `/[orgSlug]/[eventSlug]`.

For a booked-job business this page is the marketing front door; once the
public intake form ships (approved spec, not yet built), its link becomes the
"Book me" button here. The two stay separate features — the profile page is a
read-only shelf of links; intake is one item on the shelf.

## Decisions (confirmed 2026-08-08)

1. **Own path + own handle** — `traxevent.com/p/[handle]`. The bare
   `/{orgSlug}` is taken by the admin dashboard (`app/(admin)/[orgSlug]`),
   and the handle is a marketing identity the customer picks (e.g.
   `abbyscoffeecorner`), distinct from the internal org slug.
2. **Simple v1** — profile + socials + link buttons only. Full Beacons parity
   (analytics, subscribe, store, themes…) is recorded as a feature request:
   `docs/strategy/2026-08-08-beacons-parity-feature-request.md`.
3. **Links are rich** — optional thumbnail image and description blurb per
   link, matching the customer's real Beacons page, not bare buttons.
4. **Indexable** — unlike the tokenized surfaces, SEO is a feature. Real
   metadata, no robots exclusion.
5. **Brand-kit styling** — accent color through the existing WCAG contrast
   guards; no per-page theme picker in v1.
6. **Brand domains later** — serving the page at `brewtrax.com/[handle]`
   waits on the pre-DNS brand-domain decision (ROADMAP).

## Data model

New optional `public_page` map on the org doc (`orgs/{orgId}`), sibling of
`branding`:

- `enabled: boolean` — page 404s unless true.
- `handle: string` — lowercase `a-z0-9-`, 3–40 chars, must start/end
  alphanumeric (`^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`), unique across
  orgs, not in the reserved list (`admin`, `api`, `app`, `www`, `p`, `bio`,
  `inquire`, `proposals`, `invoices`, `contracts`, `client`, `brand`,
  `traxevent`, `brewtrax`).
- `display_name?: string` — falls back to `branding.display_name` → org name.
- `bio?: string` — ≤300 chars.
- `photo_url?: string` — https only.
- `socials?: { instagram?, tiktok?, youtube?, facebook?, website? }` — each an
  https URL, ≤300 chars.
- `links: Array<{ id, title, description?, image_url?, url }>` — ordered, ≤30
  entries. `title` ≤120, `description` ≤300, urls https-only ≤500. `id` is a
  client-minted uuid for stable list editing.

`parsePublicPage(input)` in new `lib/public-page.ts` follows the
`parseOrgBranding` conventions exactly: throw on malformed, drop empty fields
(absent-not-empty; Firestore rejects `undefined`), conditional-spread output.
Handle validation + reserved list live here too (`parseHandle`).

Like `OrgBranding`, the whole map is public-safe by construction — it ships
verbatim to the public page.

## Actions — `actions/public-page.ts` (authed)

Both guarded by `assertOrgAdmin`:

- `savePublicPage(orgId, input)` — parse, then write in a transaction that
  first runs the handle-uniqueness query
  (`orgs.where('public_page.handle','==',handle).limit(1)`) and rejects if a
  *different* org holds it ("That URL is taken."). Admin-SDK transactions
  support queries; this closes the check-then-set race between two orgs
  claiming the same handle.
- `getPublicPage(orgId)` — current map (or `null`) for the editor.

Asset uploads reuse `uploadOrgAsset` with the kind union extended:
`'logo' | 'cover' | 'profile_photo' | 'link_image'`. Same caps and
token-in-URL access model — these render on a public page, same as brand
assets on public proposals.

## Public page — `app/(public)/p/[handle]/page.tsx`

Server component. `params` is a Promise (Next 16) — `await` it.

- Resolve handle → org via equality query on `public_page.handle`
  (automatic single-field index on map fields; no `firestore.indexes.json`
  change). Unknown handle or `enabled !== true` → `notFound()`.
- Mobile-first single column: photo, display name, bio, social icon row,
  then the link-button stack (thumbnail + title + description when present).
  Buttons tinted with `branding.accent_color` via `readableTextOn` /
  `accentForTextOnWhite`; neutral defaults when no brand kit.
- All outbound links `target="_blank" rel="noopener noreferrer"`.
- `generateMetadata`: title = display name, description = bio, OG image =
  `photo_url`.
- Footer: "Powered by {brand}" from `org.brand_id` → `lib/brands.ts` mapping
  (default TraxEvent), linking to that brand's marketing page.
- Read-only surface — no rate limiting needed; reads go through the admin SDK
  server-side and the default-deny rules are untouched.

## Editor — `app/(admin)/[orgSlug]/public-page/page.tsx`

Client component `components/admin/PublicPageClient.tsx` following the
`BrandingClient` pattern (one `useState` per field, upload via
`uploadOrgAsset`, save-all button):

- Enable toggle + handle field with inline validation; the live URL shown
  with Copy and Open buttons once saved.
- Profile section: photo upload, display name, bio, socials.
- Links section: list with add/remove and up/down reorder (no drag library),
  per-link thumbnail upload.
- Sidebar entry in `AdminSidebar` alongside Branding.

## Error handling

- Public page: any resolution failure is `notFound()` — no distinct states
  leak (disabled vs missing look identical).
- Editor: validation errors surface inline from the thrown parse messages;
  handle conflicts show "That URL is taken."

## Testing

- `__tests__/lib/public-page.test.ts` — parse: field caps, https enforcement,
  empty-field dropping, handle regex accept/reject table, reserved list.
- `__tests__/actions/public-page.test.ts` — admin guard on both actions,
  save round-trip, handle conflict with another org rejects, same-org
  re-save of own handle passes, links cap enforced.
- Public resolution: unknown handle and `enabled: false` both 404.
- Firebase-admin mocked at module level per convention. `next build` must
  pass before the branch is called green (`use server` modules export async
  functions only — no type re-exports).

## Out of scope (deliberate — see the feature-request doc)

- Click analytics, email subscribe, store/checkout, media kit, theme picker,
  QR codes, rich embeds, per-page custom domains.
- Drag-and-drop reordering.
- Brand-domain root serving (`brewtrax.com/[handle]`).
- Intake-form integration beyond "operator pastes the intake URL as a link".
