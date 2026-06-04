# TraxEvent SaaS Platform — Design Spec

**Date:** 2026-05-28
**Product:** TraxEvent (traxevent.com)
**Status:** Approved for Phase 1 implementation planning

---

## Overview

TraxEvent is a multi-tenant SaaS camp registration and management platform. Organizations (churches, camp ministries, youth groups) sign up, create an account, and run one or more camps per year through a shared platform. The existing single-tenant Family Camp app (fhfamilycamp.com) runs in parallel during development and becomes Org #1 when the migration is ready.

**Core value proposition:** A church that runs a family camp, a youth camp, and a women's retreat can manage all three from one account, each with its own registrations, housing, teams, budget, and itinerary — without any data crossing between camps.

---

## Business Model

- **Pricing:** Flat monthly or annual subscription per org (not per camp, not per attendee)
- **Distribution:** Fully self-serve — visitor lands on traxevent.com, signs up with a card, creates their org, and starts building their first camp immediately
- **No manual provisioning required**

---

## Domain & URL Structure

| URL | Purpose |
|-----|---------|
| `traxevent.com` | Marketing site, pricing, sign up |
| `traxevent.com/login` | Auth |
| `{orgSlug}.traxevent.com` | Org admin dashboard |
| `{orgSlug}.traxevent.com/{campSlug}/register` | Public registration form |
| `{orgSlug}.traxevent.com/{campSlug}/schedule` | Public schedule/itinerary |
| Custom domain (add-on) | Orgs can point their own domain (e.g., `register.fhfamilycamp.com`) via middleware hostname mapping |

Subdomain routing is handled by Next.js middleware: incoming request to `firsthills.traxevent.com` is internally rewritten to `/firsthills/...` and the org slug is injected into route context. Custom domains follow the same middleware pattern — a Firestore lookup maps hostname → orgSlug on each request.

---

## Data Hierarchy

```
Platform
└── Org (e.g., First Hills Fellowship)
    └── Camp (e.g., Family Camp 2026, Youth Camp 2026, VBS 2026)
        └── All camp data (families, rooms, teams, budget, itinerary…)
```

Each camp is fully isolated. Registrations, accommodations, pricing, teams, budget, and itinerary all live under the camp — never shared across camps or orgs.

---

## Firestore Data Model

### Root-level collections (platform)

```
users/{uid}
  email, display_name, created_at

subscriptions/{orgId}
  plan, status, stripe_customer_id, stripe_subscription_id, current_period_end

platform_admins/{uid}
  email
```

### Org-level collections

```
orgs/{orgId}
  name, slug, billing_status, created_at

orgs/{orgId}/members/{uid}
  role: 'owner' | 'admin' | 'staff'
  display_name, email
  camp_access: {
    [campId]: {
      pages: string[]   // e.g. ['dashboard','families','assignments','teams']
    }
  }

orgs/{orgId}/invitations/{token}
  email, role, created_at, expires_at, accepted_at

orgs/{orgId}/integrations/{slug}
  type: 'pco' | 'stripe' | 'breeze' | 'twilio'
  credentials: { ... }   // encrypted at rest
  enabled: boolean
  connected_at
```

### Camp-level collections (all scoped under org)

```
orgs/{orgId}/camps/{campId}
  name, slug, year, status
  registration_type: 'family' | 'individual' | 'child'
  features: {
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
  camp_start, camp_end, created_at

orgs/{orgId}/camps/{campId}/families/{id}
orgs/{orgId}/camps/{campId}/family_members/{id}
orgs/{orgId}/camps/{campId}/registration_sessions/{id}
orgs/{orgId}/camps/{campId}/accommodation_holds/{id}
orgs/{orgId}/camps/{campId}/sections/{id}
orgs/{orgId}/camps/{campId}/accommodations/{id}
orgs/{orgId}/camps/{campId}/accommodation_assignments/{id}
orgs/{orgId}/camps/{campId}/pricing_tiers/{id}
orgs/{orgId}/camps/{campId}/teams/{id}
orgs/{orgId}/camps/{campId}/team_assignments/{id}
orgs/{orgId}/camps/{campId}/itineraries/{id}
orgs/{orgId}/camps/{campId}/budgets/{id}
orgs/{orgId}/camps/{campId}/message_log/{id}
orgs/{orgId}/camps/{campId}/staff/{id}
orgs/{orgId}/camps/{campId}/staff_invitations/{id}
```

---

## Auth & Roles

### Role hierarchy

| Role | Scope | Access |
|------|-------|--------|
| **Platform Admin** | All orgs | Full platform visibility, billing overrides, support access. You only. |
| **Org Owner** | One org | Manages billing, invites admins, full access to all camps and settings. |
| **Org Admin** | One org | Full access to all camps. Can create/archive camps, manage org settings. Cannot change billing. |
| **Camp Staff** | Specific camps only | Access controlled per camp, per page via custom toggles (see below). |

### JWT custom claims

Owners and Admins get claims set on login:
```json
{ "orgId": "abc123", "role": "owner" | "admin" }
```

Camp Staff do **not** use claims for page access — claims have a size limit. Instead, staff page permissions are read from `orgs/{orgId}/members/{uid}.camp_access` on each Server Action call. Staff get only `{ "orgId": "abc123", "role": "staff" }` in their claim.

### Staff page permission toggles

An Org Admin can toggle individual pages on or off per staff member per camp:

```
camp_access: {
  "campId_xyz": {
    pages: ["dashboard", "families", "assignments", "teams"]
    // budget, itinerary, communicate, reports are off for this person
  }
}
```

The admin UI shows a matrix: staff members as rows, camp pages as columns, with toggle switches. Changes write immediately to Firestore. Next.js middleware enforces on every route load.

### Firestore security rules

All camp data is protected by:
```
allow read, write: if request.auth.token.orgId == orgId
  && (request.auth.token.role == 'admin' || request.auth.token.role == 'owner');
```

Staff access is enforced at the Server Action layer (not Firestore rules) because per-page granularity would require unbounded rule complexity.

---

## Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend + API | Next.js 15 App Router | Server Actions replace Express; one codebase one deploy |
| Database | Firestore (sub-collections) | Already in use; sub-collections give natural isolation; Firebase Auth already solves multi-tenant identity |
| Auth | Firebase Auth + custom claims | Already integrated; custom claims carry orgId + role |
| Payments | Stripe | Already integrated for registration payments; extend for subscriptions |
| Hosting | Vercel | Already deployed here; wildcard subdomain support built in |
| Styling | Tailwind CSS + shadcn/ui | Replace inline styles from app.html |

---

## Next.js App Router Structure

```
app/
  (marketing)/
    page.tsx                      ← traxevent.com landing page
    pricing/page.tsx
    about/page.tsx

  (auth)/
    login/page.tsx
    signup/page.tsx
    onboarding/page.tsx           ← create org + first camp wizard

  (admin)/                        ← requires auth + org membership
    [orgSlug]/
      page.tsx                    ← org home: camp list + quick stats
      settings/page.tsx           ← org name, slug, timezone
      billing/page.tsx            ← Stripe Customer Portal embed
      integrations/page.tsx       ← PCO, Breeze, Twilio toggles
      members/page.tsx            ← invite + manage staff, permission matrix
      [campSlug]/
        dashboard/page.tsx
        families/page.tsx
        assignments/page.tsx
        teams/page.tsx
        budget/page.tsx
        itinerary/page.tsx
        communicate/page.tsx
        reports/page.tsx
        settings/page.tsx         ← camp type, features, dates, reg settings

  (public)/                       ← no auth required
    [orgSlug]/
      [campSlug]/
        register/page.tsx         ← public registration form
        schedule/page.tsx         ← public itinerary

  (platform)/                     ← platform_admin role only
    platform/
      orgs/page.tsx
      orgs/[orgId]/page.tsx
      billing/page.tsx

middleware.ts                     ← subdomain → orgSlug rewrite + custom domain mapping
```

---

## Camp Types & Registration Modes

Each camp is configured with a `registration_type` at creation time:

| Type | Who registers | Unit | Notes |
|------|--------------|------|-------|
| `family` | A family unit | Family record + members | Current app behavior |
| `individual` | One person per registration | Single person record | Youth camp, retreat |
| `child` | A child, parent fills form | Child record + guardian contact | VBS, kids camp |

The registration form (public-facing) renders differently based on `registration_type`. The admin Families page label and data model adapt accordingly (e.g., "Families" becomes "Registrants" for individual camps).

Accommodations, teams, budget, and itinerary are all **optional features** toggled per camp via `camp.features`. A day camp with no overnight stay simply has `accommodations: false`.

---

## Integrations Page

Each org has an integrations page at `{orgSlug}.traxevent.com/integrations`. Available integrations:

| Integration | Purpose | Credentials stored |
|------------|---------|-------------------|
| Planning Center (PCO) | Import family/person data during registration | API key + app ID |
| Stripe | Accept registration payments | Publishable key + secret key |
| Breeze ChMS | Import member data (alternative to PCO) | API key |
| Twilio | SMS communications | Account SID + auth token |

Credentials are stored encrypted in `orgs/{orgId}/integrations/{slug}`. Each integration shows a connected/disconnected status badge and a "Test connection" button.

---

## Build Phases

### Phase 1 — Foundation (spec this first, build first)
- Firestore multi-tenant data model with security rules
- Firebase Auth custom claims for org roles
- Org + Camp management UI (create org, create camp, switch between camps)
- Port all existing server.js API logic to Next.js Server Actions scoped to `orgs/{orgId}/camps/{campId}/...`
- Port all app.html React components into proper Next.js component files
- Staff invitation + permission matrix (per-camp, per-page toggles)
- Next.js middleware for subdomain routing

### Phase 2 — SaaS Shell
- Marketing landing page (traxevent.com) with pricing and sign up CTA
- Self-serve onboarding wizard: sign up → create org → first camp setup
- Stripe subscription billing (flat monthly/annual per org)
- Billing management page (Stripe Customer Portal embed)
- Email: welcome, trial expiry, payment failed

### Phase 3 — Camp Power Features
- Flexible registration types (family / individual / child) per camp
- Camp feature toggles (accommodations, teams, budget, itinerary on/off)
- Integrations page (PCO, Stripe, Breeze, Twilio per org)
- Custom domain support (middleware hostname → orgSlug mapping)
- Public camp URLs with org branding

### Phase 4 — Operations
- Platform super-admin dashboard (manage all orgs, billing, support)
- Org data migration tool (import from existing single-tenant Firestore instance)
- Platform analytics (MRR, churn, active camps, registration volume)

---

## Migration Strategy

The existing fhfamilycamp.com single-tenant app continues running untouched on its current Vercel deployment. TraxEvent is built as a separate codebase. When Phase 1 is stable, First Hills Fellowship is onboarded as Org #1 by running a migration script that reads from the flat Firestore collections and writes into `orgs/{orgId}/camps/{campId}/...` sub-collections.

---

## Domain Name

**traxevent.com** — register and configure DNS before Phase 2. Wildcard subdomain (`*.traxevent.com`) pointing to Vercel required for org subdomains.

---

## What Carries Over from the Existing App

| Existing | How it carries over |
|---------|-------------------|
| server.js API routes | Ported to Next.js Server Actions; Firestore paths updated to sub-collections |
| app.html React components | Split into individual component files under `components/` |
| Firestore queries | Path prefix changes, query logic stays the same |
| Stripe payment integration | Extended to cover subscriptions in addition to one-time payments |
| register.html | Becomes the `(public)/[orgSlug]/[campSlug]/register/page.tsx` |
| schedule.html | Becomes the `(public)/[orgSlug]/[campSlug]/schedule/page.tsx` |
| Firebase Auth setup | Stays; extended with custom claims |
| All existing tests | Adapted to new API shape |

---

## Out of Scope (for now)

- White-label theming per org (custom colors/logo beyond basic slug)
- Mobile app
- Offline mode
- Multi-language / i18n
- API for third-party developers
