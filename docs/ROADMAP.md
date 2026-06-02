# TraxEvent — Product Roadmap

TraxEvent is a multi-tenant SaaS platform for churches and ministries to manage events — camps, retreats, conferences, day programs, or any multi-day gathering. Orgs create events, open registrations, manage attendees, assign rooms and teams, track budgets, communicate with registrants, and run reports — all in one place.

---

## Phase 1 — Core Registration Loop ✅ Complete

**Goal:** End-to-end registration for a family-type event, with an admin dashboard to manage registrants.

- Multi-tenant org structure (org → events → families)
- Firebase Auth with custom claims (org role, camp access)
- Org creation + member invitations + permission matrix
- Event creation (name, dates, registration type, feature flags)
- Multi-step family registration form (contact, members, review)
- Confirmation email via Resend
- Registrant portal: view/edit registration, account profile, saved family members
- Admin families dashboard: table, search, filters, bulk status, CSV export, slide-over detail panel (Details, Campers, Payment, Notes tabs)
- Access-token signed URLs for passwordless registrant portal entry

---

## Phase 2 — Assignments & Event Configuration

**Goal:** Let admins assign registrants to rooms and teams; give event organizers control over registration settings.

### 2a — Event Settings Page
- Edit event name, dates, status (draft → active → archived)
- Toggle feature flags (accommodations, teams, budget, itinerary, communicate)
- Registration open/close dates and capacity cap
- Custom fields on the registration form (free-form questions per event)
- Waitlist behavior (auto-promote or manual)

### 2b — Individual & Child Registration Types
- `individual` type: one form per person (conferences, retreats)
- `child` type: guardian fills form on behalf of a child (day camps, VBS)
- Registration form adapts to type
- Admin families dashboard adapts column labels (Attendees instead of Campers, etc.)

### 2c — Room/Accommodation Assignments
- Admin defines rooms: name, capacity, gender restriction, cabin/building grouping
- Drag-and-drop or bulk-assign families/individuals to rooms
- Occupancy bar per room, overbook warnings
- Print-ready cabin list export

### 2d — Team Assignments
- Admin defines teams: name, color, leader
- Assign registrants to teams (manual or auto-balance by age/gender)
- Team roster view
- Export team lists

---

## Phase 3 — Billing, Budget & Communication

**Goal:** Collect payments, track event budget, and communicate with registrants.

### 3a — Stripe Payment Collection
- Connect Stripe account per org (Stripe Connect)
- Set registration cost per event (flat fee or tiered)
- Payment link sent in confirmation email
- Registrant pays via hosted Stripe checkout
- Payment status synced back to `Family.payment_status` and `amount_paid`
- Refunds triggered from admin panel

### 3b — Subscription Billing
- Org billing tiers: Free (1 active event, limited registrations), Pro (unlimited), Enterprise
- Stripe billing portal for self-serve plan management
- `billing_status` enforcement: `trialing → active → inactive`
- Usage metering (registrations per billing period)
- Platform admin dashboard for subscription oversight

### 3c — Budget Module
- Admin sets line-item budget (food, transport, lodging, activities, etc.)
- Actual spend tracked against budget
- Revenue from registrations shown against costs
- Per-head cost calculator
- Budget export (CSV)

### 3d — Communication
- Email blast to all registrants (or filtered by status/team/room)
- Templated messages: pre-event reminders, packing lists, schedule
- Individual email from admin slide-over
- SMS (via Twilio) as optional add-on
- Communication log per family

---

## Phase 4 — Reports & Integrations

**Goal:** Give admins the data they need and connect to tools they already use.

### 4a — Reports
- Registration summary (counts by status, type, payment)
- Dietary/allergy report (for kitchen/food team)
- Medical notes report (for health staff)
- T-shirt sizes report
- Financial report (revenue, outstanding balances, refunds)
- Custom report builder (select fields → export CSV)

### 4b — Planning Center Online Integration
- OAuth connect to PCO account
- Pull household data to pre-fill registration (via `pco_household_id`)
- Push attendance/check-in data back to PCO People
- Import PCO group as registrant list

### 4c — Breeze ChMS Integration
- Connect Breeze account
- Pull family/member records
- Push event attendance

### 4d — Itinerary Builder
- Day-by-day schedule with time blocks
- Assign activities to rooms/groups
- Publish itinerary to registrant portal
- Print-friendly schedule export

---

## Phase 5 — Platform & Scale

**Goal:** Polish the platform, add discovery, and support larger organizations.

- Public event landing page (shareable registration URL without auth)
- Event duplication (clone last year's event with settings intact)
- Multi-event dashboard for orgs running several events simultaneously
- Platform admin: org list, usage, billing overrides, support tools
- White-label / custom domain support per org
- API access for enterprise orgs
- Mobile-optimized registrant portal (PWA)

---

## Current Status

| Area | Status |
|------|--------|
| Core auth + multi-tenant | ✅ Done |
| Family registration form | ✅ Done |
| Registrant portal | ✅ Done |
| Admin families dashboard | ✅ Done |
| Event settings page | 🔲 Not started |
| Individual/child reg types | 🔲 Not started |
| Room assignments | 🔲 Not started |
| Team assignments | 🔲 Not started |
| Stripe payments | 🔲 Not started |
| Subscription billing | 🔲 Not started |
| Budget module | 🔲 Not started |
| Communication | 🔲 Not started |
| Reports | 🔲 Not started |
| PCO integration | 🔲 Not started |
| Breeze integration | 🔲 Not started |
| Itinerary builder | 🔲 Not started |
| Public event page | 🔲 Not started |
