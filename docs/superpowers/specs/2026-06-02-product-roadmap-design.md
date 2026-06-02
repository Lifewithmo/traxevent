# TraxEvent Product Roadmap Design

## Vision

TraxEvent is a platform-level event management and registration network. Orgs run any type of event through a dynamic framework that reconfigures itself per event type. People maintain one universal profile that follows them across every org and event on the platform. The vertical is just a skin — the engine underneath is universal.

The closest analogy: Mindbody for events and ministry. One platform powering churches, secular camps, sports leagues, wedding businesses, corporate events, and more — each experiencing a product that feels built exactly for them.

---

## Business Model

### Pricing
- **$199/year** — flat annual fee, billed upfront, no refunds, no monthly option
- **1% of gross paid registrations** — collected automatically via Stripe Connect
- **Free events** — unlimited, no fee
- **30-day free trial** — no credit card required

### Payment Infrastructure
- **Stripe Connect Standard** — orgs connect their own Stripe account
- Money flows directly to the org — TraxEvent never holds funds
- 1% platform fee splits automatically into TraxEvent's Stripe account
- Zero money transmission liability
- Zero reconciliation overhead

### All-In Cost to Orgs
| Registration amount | Stripe fee | TraxEvent fee | Total | % of transaction |
|--------------------|-----------|--------------|-------|-----------------|
| $25/person | $1.03 | $0.25 | $1.28 | 5.1% |
| $50/person | $1.75 | $0.50 | $2.25 | 4.5% |
| $100/person | $3.20 | $1.00 | $4.20 | 4.2% |
| $200/person | $6.10 | $2.00 | $8.10 | 4.1% |

Cheaper than every competitor at every price point.

### Anti-Gaming
- Annual billing upfront — nothing to turn on/off seasonally
- Historical data (registrant lists, medical forms, payment history) requires active subscription
- 1% fee is too small to incentivize routing payments outside the platform

### Revenue Scale
| Year | Orgs (min–max) | ARR (min–max) | Infrastructure/yr | Profit (min–max) |
|------|---------------|--------------|-------------------|-----------------|
| 1 | 25–150 | $8K–$45K | $384 | $7.6K–$44.6K |
| 2 | 150–600 | $48K–$191K | $1,020 | $47K–$190K |
| 3 | 400–1,500 | $128K–$479K | $4,320 | $123K–$474K |
| 4 | 1,000–4,000 | $319K–$1.27M | $13,188 | $226K–$1.18M |
| 5 | 3,000–10,000 | $957K–$3.19M | $34,800 | $922K–$3.15M |

Break-even: 53 orgs at $199/year covers all infrastructure costs.

### Competitive Position
| Competitor | Annual cost | Camp depth | Church-native | Event-type dynamic |
|------------|-------------|-----------|--------------|-------------------|
| CampBrain | $2,500–$5,000+ | Full | No | No |
| CampMinder | $2,500–$10,000+ | Full | No | No |
| PCO Registrations | $348–$2,388 | Shallow | Yes | No |
| RegFox | $0 + $4.99/registrant | None | No | No |
| **TraxEvent** | **$199 + 1%** | **Full** | **Yes** | **Yes** |

### Future Pricing Tiers
As the platform matures and business verticals are added:

| Tier | Target | Price |
|------|--------|-------|
| Ministry | Churches, nonprofits | $199/year |
| Business | Wedding, floral, events businesses | $79/month |
| Network | Denominations, franchises, multi-org chains | $249/month |

---

## Platform Architecture

### The Core Insight
Every competitor made an early domain decision that hardcoded their product:
- CampBrain: "We are camp software"
- Eventbrite: "We are ticketing software"
- PCO Registrations: "We are church signup software"

TraxEvent's architectural decision: **the event type IS the product configuration.** The management framework reconfigures itself per event. Same org, same admin, completely different experience depending on what kind of event is being run.

### Universal Org Hierarchy
```
Organization (top level)
  └── Department / Division
        └── Ministry / Program / Team
              └── Event
                    └── Registrants
                          └── Assignments
```

In different verticals:
| Level | Church | Youth Camp | Sports Club | Business | University |
|-------|--------|-----------|-------------|----------|------------|
| Org | First Baptist | Camp Pinewood | Metro FC | Acme Corp | State University |
| Department | Youth, Worship | Boys, Girls | U10, U12, U14 | Sales, HR | Arts, Business |
| Program | Youth Group, VBS | Week 1, Week 2 | Rec, Travel | New Hire Dev | Orientation |
| Event | Summer Camp | Session A | Spring Season | Onboarding Day | Fall Gala |
| Registrant | Family/Child | Camper | Player/Family | Employee | Student/Guest |
| Assignment | Cabin/Team | Bunk/Group | Team/Division | Cohort/Room | Table/Track |

The hierarchy is **optional in the UI** — small orgs see Org → Event only, complexity unlocks as needed.

### Event Type Framework
Each event has an event type — a configuration bundle that drives the entire management experience:

```typescript
interface EventType {
  id: string
  name: string                     // "Summer Camp", "Gala", "VBS"
  terminology: Terminology         // labels for every UI string
  registrationUnit: 'family' | 'individual' | 'child'
  assignmentTypes: AssignmentType[] // cabin, table, class, team
  requiredForms: FormTemplate[]    // medical, waiver, passport
  paymentModel: PaymentModel       // flat, per-ticket, fundraising
  features: FeatureFlags           // which modules are active
  checkInMode: CheckInMode         // standard, guardian-pickup, manifest
  postEventActions: Action[]       // follow-up workflows
}
```

Built-in event types at launch:
- **Summer Camp** — family registration, cabin/team assignments, medical forms, daily check-in
- **Retreat** — individual registration, room assignments, meal preferences
- **VBS** — child + guardian registration, class assignments, guardian pickup check-in
- **Gala/Fundraiser** — individual/couple registration, table seating, ticket tiers
- **Mission Trip** — individual registration, team assignments, document collection (passport, medical)

Custom event types unlocked in Phase 3.

### Terminology Skin System
Every piece of UI text that is domain-specific is driven by a terminology config. Same feature, different label per event type:

| Config key | Summer Camp | Gala | VBS | Mission Trip |
|-----------|-------------|------|-----|--------------|
| `registrantSingular` | Family | Guest | Child | Participant |
| `registrantPlural` | Families | Guests | Children | Participants |
| `assignmentSingular` | Cabin | Table | Class | Team |
| `memberSingular` | Camper | Guest | Child | Member |
| `eventLabel` | Camp | Gala | VBS | Trip |

The vertical skin is a higher-level config that sets terminology defaults plus branding. Orgs can override individual terms.

### Platform-Level People Model
Every person on TraxEvent has one universal profile, regardless of how many orgs or events they interact with:

```
Platform Person (one profile, forever)
  └── At Org A:
        ├── Role: Volunteer (cabin leader, Summer Camp 2026)
        ├── Role: Registrant (their child is attending)
        └── Role: Staff (they manage VBS)
  └── At Org B:
        └── Role: Registrant (attending Grace Church retreat)
```

**Privacy model:** Orgs see only data relevant to their event. Cross-org activity is never visible to orgs. The person controls what gets shared via event-specific consent at registration time.

**COPPA compliance:** Parent/guardian owns the profile. Child records live under the parent's profile. No accounts are ever created directly for children under 13.

**People categories:**
- **Admin/Staff** — manage the platform for the org
- **Event Staff** — assigned to specific events (paid)
- **Volunteers** — assigned to specific events (unpaid)
- **Registrants** — attending an event

A person can hold multiple roles simultaneously at the same event. All roles follow the same registration flow — the role is assigned on top of the standard registration, not a separate track.

### Permission Model — Attribute-Based Access Control (ABAC)
Permissions are per-person per-scope, not just role-based. Three dimensions:
- **Who** — the specific person
- **Where** — org level or specific event
- **What** — which sections/modules they can access

Permission card per person per scope:
```
Mike Johnson at Summer Camp 2026
  Registrant list     ✅
  Medical forms       ✅
  Payments/balances   ❌
  Cabin assignments   ✅
  Team assignments    ✅
  Communication       ❌
  Reports             ❌
  Check-in            ✅
```

**Permission templates** provide reusable starting points:
- Cabin Leader → medical, cabin roster, check-in
- Check-in Volunteer → check-in dashboard, names/photos only
- Finance Admin → payments, balances, reports
- Event Overseer → everything except payments
- Custom → build your own

Apply a template, then tweak per person. Permission inheritance: org-level defaults flow down to events, overridable per event per person.

Permission levels:
| Level | Who |
|-------|-----|
| Org Owner | Full access to everything |
| Dept Admin | Their department only |
| Program Manager | Their program only |
| Event Staff | Their event only, sections per ABAC |
| Volunteer | Their assigned sections only |
| Registrant | Their own registrations only |
| Finance Admin | Payment data across assigned scope |
| Reports Only | Read-only across assigned scope |

---

## Firestore Data Model

```
/platform_persons/{uid}              ← universal person profile
  /saved_members/{memberId}          ← family members, reusable across events

/orgs/{orgId}                        ← organization
  /members/{uid}                     ← org-level role + permissions
  /invitations/{token}               ← pending invitations
  /departments/{deptId}              ← department/division
    /programs/{programId}            ← ministry/program/team
      /events/{eventId}              ← event (replaces "camp")
        /registrants/{registrantId}  ← registration record
          /members/{memberId}        ← people attending
          /assignments/{id}          ← room, team, table assignments
        /volunteers/{uid}            ← volunteer assignments + permissions
        /staff/{uid}                 ← event staff assignments + permissions
        /assignments/{id}            ← assignment definitions (cabin 4, table 7, team blue)
        /forms/{formId}              ← form templates per event
        /checkins/{date}/{uid}       ← daily attendance records

/subscriptions/{orgId}               ← Stripe subscription data
```

---

## Phase Roadmap

### Current State — Complete
- Multi-tenant org structure (org → camps → families)
- Firebase Auth + custom claims (org role, camp access)
- Family registration form (contact, members, review)
- Confirmation email via Resend
- Registrant portal (view, edit, account, saved members)
- Admin families dashboard (table, search, filters, bulk actions, slide-over, CSV export)
- Access-token signed URLs for passwordless portal access
- Member invitations + permission matrix (basic)

---

### Phase 1 — Go-To-Market Ready
**Goal:** Complete, sellable product. An org can sign up, run a paid event, collect money, and TraxEvent gets paid.

**Billing + Payments:**
- $199/year subscription via Stripe Billing (org signup → Stripe checkout → active subscription)
- Stripe Connect Standard onboarding flow (org connects their Stripe account in 2 minutes)
- Payment collection on registration forms (Stripe payment element)
- Automatic 1% platform fee split via Stripe Connect
- Subscription management (cancel, renew, trial-to-paid conversion)
- Billing portal for orgs (self-serve via Stripe Customer Portal)

**Event Type Framework:**
- Event type config system (terminology, features, registration unit)
- Built-in event types: Summer Camp, Retreat, VBS, Gala, Mission Trip
- Terminology-driven UI (all labels driven by event type config)
- Event settings page (name, dates, status, registration open/close, capacity cap, event type)

**Registration Improvements:**
- Individual registration type (one form per person)
- Child registration type (guardian fills for child)
- Pre-fill from platform profile on return visits
- Waitlist support (auto-enroll when capacity reached)

**Communication:**
- Basic email blast to all registrants for an event
- Email templates per event type
- Registrant communication log
- Reply-to address configurable per event (replies route to the admin, not TraxEvent)
- Custom "from" display name per event (e.g., "Summer Camp 2026 at First Baptist")

---

### Phase 2 — Full Operations
**Goal:** Real camp/event management depth. The features that separate a registration form from a management platform.

**Assignments:**
- Room/cabin assignment module (define rooms, assign registrants, occupancy tracking)
- Team assignment module (define teams, assign registrants, auto-balance option)
- Table/seating assignment (for gala event type)
- Class assignment (for VBS event type)
- Assignment print export (cabin list, team roster, seating chart)

**People Management:**
- Event-level volunteer registration via standard registration flow
- Volunteer role assignment (cabin leader, check-in, kitchen, etc.)
- Event staff assignment
- Per-person per-event ABAC permission toggles
- Permission templates (cabin leader, check-in volunteer, finance admin, etc.)
- Background check collection (Ministry Safe integration)
- Staff/volunteer communication channel (separate from registrants)

**Forms & Signatures:**
- Form template builder at org level (reusable across any event)
- Event-level form assignment (inherit org templates or define event-specific versions)
- Form types: liability waiver, medical authorization, photo/media consent, code of conduct, background check consent, custom
- Field types: text, textarea, checkbox, radio, dropdown, date, file upload, signature pad
- Audience targeting per form: `registrant/parent`, `volunteer`, `staff`
- Digital signature: typed full name + timestamp + IP address (legally valid under E-SIGN Act)
- Immutable PDF snapshot of the document as it existed at signing, stored per registrant
- Signed copy emailed to signer automatically
- Form versioning — old signatures remain tied to the exact version that was signed
- Medical form collection built on the form builder (not a separate system)
- Health record storage per person
- Dietary/allergy report generation
- Document collection (passport copy, insurance card upload)

**Communication:**
- Custom sending domain: org verifies their domain via DNS (SPF/DKIM) to send from `@their-domain.org`

**Check-In:**
- Daily attendance check-in dashboard
- Guardian pickup mode (VBS/child events)
- Event manifest (mission trip)
- Check-in reporting

---

### Phase 3 — Org Hierarchy + Platform Profiles
**Goal:** The structural upgrade that makes TraxEvent a platform, not an app.

**Org Hierarchy:**
- Department and program levels exposed in UI (optional, unlocked by org)
- Full ABAC permission model at org and department level
- Permission inheritance (org defaults → department → event)
- Cross-event reporting within org
- Org-wide registrant database (one family record across all events)

**Platform-Level People:**
- Platform person profile (universal, cross-org)
- Profile pre-fill across any org's registration on the platform
- Person deduplication (merge duplicate platform profiles)
- Family members shared across all events platform-wide
- Cross-event registration history (private to the person)

**Event Operations:**
- Event duplication (clone previous year's event with settings intact)
- Custom event types (org defines their own event type config)
- Itinerary builder (day-by-day schedule with time blocks, publish to registrant portal)
- Volunteer hours tracking
- Cross-event staff scheduling

**Forms (advanced):**
- Conditional logic (show/hide fields based on other answers)
- Bulk missing-signatures view (who hasn't completed required forms)
- Form submission reports

**Communication:**
- Per-staff sender identity (individual staff send from `john@their-domain.org` once org domain is verified)

**Reports:**
- Registration summary (counts by status, type, payment)
- Dietary/allergy report
- Medical notes report
- T-shirt sizes report
- Financial report (revenue, outstanding balances, refunds)
- Custom report builder (select fields → export CSV)

---

### Phase 4 — Network + Denomination Tier
**Goal:** Enterprise play. One deal = dozens of orgs onboarded overnight.

- Parent org / child org structure (denomination → member churches)
- Network admin dashboard (aggregated view across all member orgs)
- Shared event templates pushed down to member orgs
- Aggregated reporting across member orgs
- Network-wide pricing and billing management
- District/regional coordinator role
- Bulk org onboarding (import member church list)
- Network-branded portal (denomination's own domain)

---

### Phase 5 — Business Vertical
**Goal:** Unlock wedding, floral, corporate events market. Same platform, business-oriented features added.

- Custom pricing per client/event (quote-based, not flat rate)
- Invoice builder (itemized services, line items, totals)
- Contract upload + e-signature collection
- Lead pipeline (Inquiry → Consultation → Proposal → Booked → Delivered)
- Proposal builder (create itemized service proposals, client accept/reject)
- Vendor management (track external vendors per event)
- Client portal (client-facing view of their event details, invoice, timeline)
- Business pricing tier ($79/month, replaces $199/year for business orgs)

---

### Phase 6 — Integrations + Distribution
**Goal:** Data moat and distribution unlock. PCO Marketplace listing is the single highest-leverage growth event on the roadmap.

- **Planning Center Online (PCO)** — bidirectional sync: pull household records, push attendance, list in PCO Marketplace
- **Breeze ChMS** — pull family/member records, push event attendance
- **Rock RMS** — webhook-based integration
- **Zapier** — connect TraxEvent to any tool via webhooks
- **Ministry Safe / Protect My Ministry** — background check integration for volunteers
- **Twilio** — SMS communication add-on
- **Public event discovery page** — shareable registration URL without requiring org login
- **Mobile-optimized registrant portal** (PWA)
- **API access** — for enterprise orgs building custom integrations

---

## What Makes This Defensible

1. **Event-type dynamic framework** — nobody else reconfigures the entire management experience per event. Architectural moat, not a feature.

2. **Platform-level person profiles** — the more families register across different orgs on TraxEvent, the more valuable the platform becomes for every org. Classic network effect.

3. **Price point** — $199/year is 10-25x cheaper than the next comparable platform. Competitors cannot match it without destroying their own revenue model.

4. **PCO Marketplace** — when the integration goes live, 50,000 churches can find TraxEvent without any marketing spend.

5. **Denomination deals** — one network-tier deal adds 20-50 member orgs overnight. Compounding growth with a single sales motion.

---

## Current Status

| Area | Status |
|------|--------|
| Core auth + multi-tenant | Done |
| Family registration form | Done |
| Registrant portal | Done |
| Admin families dashboard | Done |
| Event type framework | Phase 1 |
| Stripe billing ($199/yr) | Phase 1 |
| Stripe Connect (1% fee) | Phase 1 |
| Event settings page | Phase 1 |
| Individual/child reg types | Phase 1 |
| Profile pre-fill (return visits) | Phase 1 |
| Basic email communication | Phase 1 |
| Room/cabin assignments | Phase 2 |
| Team assignments | Phase 2 |
| Volunteer management | Phase 2 |
| Forms & signatures module | Phase 2 |
| Custom sending domain (DNS/DKIM) | Phase 2 |
| Conditional form logic | Phase 3 |
| Per-staff sender identity | Phase 3 |
| Medical forms (built on form builder) | Phase 2 |
| ABAC permissions | Phase 2 |
| Check-in system | Phase 2 |
| Org hierarchy (dept/program) | Phase 3 |
| Cross-org person profiles | Phase 3 |
| Event duplication | Phase 3 |
| Itinerary builder | Phase 3 |
| Reports | Phase 3 |
| Network/denomination tier | Phase 4 |
| Business vertical features | Phase 5 |
| PCO integration | Phase 6 |
| Breeze integration | Phase 6 |
| Zapier/webhooks | Phase 6 |
