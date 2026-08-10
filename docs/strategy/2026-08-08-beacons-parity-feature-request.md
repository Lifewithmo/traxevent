# Beacons parity — feature request log

Date: 2026-08-08
Source: live customer request — an operator wants to replace their Beacons
(beacons.ai) link-in-bio page with a platform-hosted one.
Status: v1 (simple links page) designed —
`docs/superpowers/specs/2026-08-08-public-profile-page-design.md`. Everything
below is the **rest** of the Beacons buildout, recorded so it isn't forgotten.
Nothing here is committed roadmap; pull items in when a customer actually
needs them.

## What v1 ships

Public page at `/p/[handle]`: photo, display name, bio, social icons, ordered
rich link buttons (thumbnail + title + description), brand-kit tinting,
indexable, editor in org settings.

## The rest of Beacons, itemized

### Click analytics (most likely next)
Per-link click counts and page-view counts, with a simple time-window view in
the editor ("this week / all time"). Involves a public write endpoint (click
beacon) — must sit behind the rate-limit seam from the intake-form spec, and
counters should be sharded or batched to keep Firestore write costs sane.
Moderate. This is the Beacons feature operators most visibly lose.

### Email subscribe block
"Subscribe" button → name/email capture → per-org subscriber list with CSV
export. Public write endpoint (rate-limit seam again) + a `subscribers`
subcollection + list UI. Real GDPR/unsubscribe obligations the moment we
store marketing contacts — do not ship casually. Moderate-plus. Natural
adjacency: these contacts could feed the CRM as customers with a
`subscriber` tag instead of a parallel list.

### Store / checkout blocks
Beacons sells digital products and takes payment. We already have Stripe
Connect per org — a "product" block with price + Stripe Checkout is
plausible and differentiated (Beacons takes a cut; we already bill the org).
Large. Overlaps with the deferred POS/inventory vertical modules — coordinate
before building.

### Media kit page
Auto-generated "work with me" page: follower counts, audience stats, rate
card, past collabs. Follower counts require social API integrations (fragile,
OAuth per platform) — the rate-card/portfolio half is easy, the stats half is
not. Large. Low priority until creators, not operators, are a target segment.

### Theme picker
Per-page fonts/backgrounds/button shapes beyond brand-kit tinting. Small-to-
moderate; pure presentation. Cheap win once several customers use the page.

### QR code generator
Server-rendered QR of the page URL for carts/signage/business cards. Small —
a genuinely quick follow-up, and very on-brand for physical-presence
operators (coffee carts).

### Rich embeds
Inline YouTube/TikTok/Spotify players instead of outbound buttons. Small-to-
moderate; iframe allowlist + oEmbed lookups. Presentation-only.

### Per-page custom domains
`links.abbyscoffee.com` → their page. Heavy (per-customer DNS + cert
automation); distinct from the brand-domain work (`brewtrax.com/[handle]`),
which is the cheaper 90% answer and already gated on the ROADMAP pre-DNS
decision. Defer hard.

### Scheduling links
"Book a call" native block (calendar availability → booking). Overlaps with
the org-calendar roadmap line (#15a/b) — revisit after ICS sync lands rather
than building a separate scheduler here.

## Sequencing note

If demand materializes, the likely order is: QR code → click analytics →
theme picker → email subscribe → the rest by customer pull. Analytics and
subscribe both depend on the public rate-limit seam, which ships with the
intake form increment.
