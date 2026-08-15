# Occasions Core Implementation Plan (Selling Occasions increment 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Market days become a first-class kind of Event — with location/hours/booth-fee, first-class weekly series that materialize their whole season up-front, direct-create and convert-from-pipeline paths, the Events-section nav rework (occasion rows, Drops absorbed, one "+ New" chooser), and the R1 slimming of camp-era registration fields — per spec `docs/superpowers/specs/2026-08-15-selling-occasions-pos-design.md` §3, §6, §8-R1, §9.1.

**Architecture:** `Event` gains optional occasion fields (`kind`, `location`, `hours`, `booth_fee`, `series_id`) read only through a pure `kindOf()` helper; a new `orgs/{orgId}/event_series` collection generates real Event docs up-front through a pure occurrence engine (idempotent per series+day, cap 30). Every existing Event surface (calendar, agenda rail, sidebar, duplicate, convert) works on market days automatically because they ARE events. R1 makes `registration_type`/`features` optional, stops writing `features`, and gates roster-only settings fields on the `attendee-roster` module.

**Tech Stack:** Next.js 16.2.6 (App Router, classic caching), React 19, Firebase Admin SDK, Tailwind 4, vitest.

## Global Constraints

- **Next 16.2.6 conventions:** `params` are Promises and awaited; new pages declare `export const dynamic = 'force-dynamic'` line 1 (client pages excepted — `/new-event` is the house precedent for `'use client'` create pages); no `'use cache'`/`revalidateTag`; never re-export a type from a `'use server'` module.
- **House data conventions:** snake_case fields; ISO-string timestamps; entity ids `randomBytes(8).toString('hex')` OR Firestore auto-ids (events use auto-ids — keep that); docs carry their own `id`; strip `undefined` via conditional spreads; update semantics `undefined` = untouched / `null` = `FieldValue.delete()` + always `updated_at`.
- **`kind` is read ONLY via `kindOf(event)`** (`kind ?? 'client_job'`) — no code reads `event.kind` raw (spec §3.1). Kinds share the spine; divergence only in detail UI (spec discipline note).
- **Series rules (spec §3.2):** weekly only; occurrences capped at **30** (exceeding → error naming the cap); generation **idempotent per (series_id, day)**; generated days are `kind: 'market_day'`, `status: 'active'`, `event_start === event_end === day`; skip = archive the day; propagation touches only future (`event_start >= today`), non-archived, same-series days; extend only raises `until` and generates the delta.
- **R1 slimming (spec §3.1/§8):** `registration_type` optional on Event + create input (existing client-job paths keep passing it — derived from the EventType — so roster behavior is unchanged until R2; market-day/series paths omit it; readers fall back `?? 'individual'`); `features` optional, **no longer written on create or copied on duplicate** (audit: zero runtime readers); `capacity`/`payment_amount`/`registration_open`/`registration_close` inputs render only when the org pack has `attendee-roster`. Nothing stored is deleted in R1.
- **Nav (spec §6):** Events section children = upcoming occasion rows (market days tagged) → Drops row (storefront-gated, moved OUT of Catalog) → All events → "+ New" chooser (`/{orgSlug}/new`: Client job / Market day / Series / Drop). New org slugs `new`, `new-market-day`, `new-series`, `series` join `ORG_PAGE_SLUGS` + `SECTION_FOR_SLUG` (→ `'events'`). Rail gating unchanged.
- **Market-day job nav (inc-1 subset):** Overview (`dashboard`) + Settings only; Register/Closeout rows arrive with increment 2 (documented deviation from spec §6's end-state list — the closeout page still requires an ops plan until inc 2 extends it, so linking it now would present a dead end). Roster pages never render for market days regardless of modules.
- **Tests:** vitest; `vi.hoisted` spies → `vi.mock` → import-under-test; `beforeEach(() => vi.clearAllMocks())`; AdminSidebar tests use the file's `nav.pathname` + `rowActive`/`sectionActive` helpers. Full suite + `npx tsc --noEmit -p tsconfig.json` (2 pre-existing BrandingClient errors are the known baseline) + `npx next build` green before the branch is done.
- **Commits:** one per task, `feat(occasions): …` style, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

**New files**
```
lib/occasions/kind.ts                 pure: EventKind, kindOf, EVENT_KIND_LABELS
lib/occasions/series-logic.ts         pure: seriesOccurrences (weekly date math, cap 30)
lib/occasions/series.ts               core: event_series CRUD + generation/propagate/extend/end
actions/series.ts                     guarded wrappers
app/(admin)/[orgSlug]/new/page.tsx    the "+ New" chooser
app/(admin)/[orgSlug]/new-market-day/page.tsx
app/(admin)/[orgSlug]/new-series/page.tsx
app/(admin)/[orgSlug]/series/[seriesId]/page.tsx
components/admin/occasions/SeriesClient.tsx
components/admin/occasions/MarketDayOverview.tsx
__tests__/lib/occasions/kind.test.ts
__tests__/lib/occasions/series-logic.test.ts
__tests__/lib/occasions/series.test.ts
__tests__/actions/series.test.ts
__tests__/components/admin/occasions/SeriesClient.test.tsx
__tests__/components/admin/occasions/NewOccasionChooser.test.tsx
```

**Modified files**
```
lib/types.ts                          Event occasion fields; registration_type/features optional; EventSeries
lib/events.ts                         CreateEventCoreInput occasion fields; conditional registration_type; no features write; status override
actions/events.ts                     createMarketDay; updateEvent Pick + location/hours/booth_fee; duplicate drops features, copies occasion fields
lib/crm/convert.ts                    ConvertToWorkInput.kind (optional)
components/admin/opportunity/ConvertToWorkCard.tsx   kind choice (Client job / Market day)
app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx  roster fields gated on attendee-roster; market-day fields branch
app/(admin)/[orgSlug]/[eventSlug]/dashboard/page.tsx market-day overview branch
app/(admin)/[orgSlug]/[eventSlug]/layout.tsx         passes eventKind to AdminSidebar
components/layout/AdminSidebar.tsx    Events-section rework; Drops row moves; market-day job nav; + New
lib/sidebar-nav.ts                    ORG_PAGE_SLUGS += new, new-market-day, new-series, series
lib/sidebar-events.ts                 SidebarEventRow.kind + tag
app/(admin)/[orgSlug]/page.tsx        kind grouping + badges + series links
lib/calendar.ts                       event block: market-day location detail
5 registration_type reader sites      ?? 'individual' fallbacks (Task 3 lists them)
__tests__: events, duplicate-event, convert, ConvertToWorkCard, AdminSidebar, sidebar-events, calendar — extended
docs/ROADMAP.md                       In-flight entry (Task 12)
```

---

### Task 1: Types + kindOf

**Files:**
- Modify: `lib/types.ts` (Event interface ~lines 107-138; new section after it)
- Create: `lib/occasions/kind.ts`
- Test: `__tests__/lib/occasions/kind.test.ts`

**Interfaces:**
- Produces (every later task): on Event — `kind?: EventKind`, `location?: EventLocation`, `hours?: EventHours`, `booth_fee?: number`, `series_id?: string`, `registration_type?: EventRegistrationType` (now optional), `features?: {…}` (now optional); new exported types `EventKind`, `EventLocation`, `EventHours`, `SeriesRecurrence`, `EventSeries`; from `@/lib/occasions/kind`: `kindOf(e): EventKind`, `EVENT_KIND_LABELS: Record<EventKind, string>`.

- [ ] **Step 1: Write the failing test** — `__tests__/lib/occasions/kind.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { kindOf, EVENT_KIND_LABELS } from '@/lib/occasions/kind'

describe('kindOf', () => {
  it('treats absent kind as client_job (zero-migration default)', () => {
    expect(kindOf({})).toBe('client_job')
    expect(kindOf({ kind: undefined })).toBe('client_job')
  })
  it('passes explicit kinds through', () => {
    expect(kindOf({ kind: 'market_day' })).toBe('market_day')
    expect(kindOf({ kind: 'client_job' })).toBe('client_job')
  })
  it('labels both kinds', () => {
    expect(EVENT_KIND_LABELS.client_job).toBe('Client job')
    expect(EVENT_KIND_LABELS.market_day).toBe('Market day')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/occasions/kind.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement.** In `lib/types.ts`, change two existing Event lines and append occasion fields inside the interface:

```ts
  registration_type?: EventRegistrationType   // optional since occasions R1; roster paths fall back to 'individual'
  features?: {                                // optional since occasions R1; never written on create anymore (zero readers)
    accommodations: boolean
    teams: boolean
    budget: boolean
    itinerary: boolean
    communicate: boolean
  }
```

and add to the Event interface (after `department_id`):

```ts
  // ── occasion fields (spec 2026-08-15 selling-occasions §3.1) ──
  kind?: EventKind                   // ABSENT = 'client_job'; read ONLY via kindOf()
  location?: EventLocation           // market days require it; client jobs may use it
  hours?: EventHours                 // 'HH:mm' working hours, display + future register header
  booth_fee?: number                 // dollars; market-day cost, joins closeout margin (inc 2)
  series_id?: string                 // set on series-generated days
```

then append after the Event-related types:

```ts
// ── Selling occasions (spec 2026-08-15) ──────────────────────────────

export type EventKind = 'client_job' | 'market_day'
export interface EventLocation { name: string; address?: string }
export interface EventHours { start: string; end: string }   // 'HH:mm'

export interface SeriesRecurrence {
  freq: 'weekly'
  weekday: number                    // 0–6 (Sun–Sat)
  from: string                       // YYYY-MM-DD, first candidate day
  until: string                      // YYYY-MM-DD inclusive, season end
}

export interface EventSeries {
  id: string
  name: string                       // "Boise Farmers Market"
  kind: 'market_day'                 // v1: market-day series only
  location: EventLocation
  hours: EventHours
  recurrence: SeriesRecurrence
  booth_fee?: number                 // default copied onto each generated day
  event_type_id?: string
  active: boolean                    // false = season ended early
  created_at: string
  updated_at?: string
}
```

Create `lib/occasions/kind.ts` (pure — no imports beyond types):

```ts
import type { Event, EventKind } from '@/lib/types'

/** The ONLY way to read an event's kind — absent means client_job (zero migration). */
export function kindOf(e: Pick<Event, 'kind'>): EventKind {
  return e.kind ?? 'client_job'
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  client_job: 'Client job',
  market_day: 'Market day',
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run __tests__/lib/occasions/kind.test.ts` → PASS.
Run: `npx tsc --noEmit -p tsconfig.json` — NEW errors will appear at the 5 `registration_type` reader sites and possibly `features` fixtures; **expected at this stage** — Task 3 fixes production readers; fixtures compile because providing an optional is legal. If a fixture DOES error (e.g. `'open' as Event['registration_type']` in `__tests__/lib/today-moves.test.ts:88` — the cast target is now optional, still compiles), note it in the report. Errors in `components/registration/RegistrationForm.tsx`, `app/(admin)/[orgSlug]/[eventSlug]/assignments/print/page.tsx`, `checkin/page.tsx`, `reports/page.tsx`, `settings/page.tsx` are FIXED IN THIS TASK to keep the tree green: apply `?? 'individual'` at each read site, e.g. in `components/registration/RegistrationForm.tsx:40`:

```ts
const registrationUnit = event.registration_type ?? 'individual'
```

and in `app/(admin)/[orgSlug]/[eventSlug]/assignments/print/page.tsx:53`:

```ts
const registrationUnit = event.registration_type ?? 'individual'
```

`checkin/page.tsx:28` (`=== 'child'`) and `reports/page.tsx:24` (display) compile with optional but apply the same explicit fallback at reports for display stability: `registrationType={event.registration_type ?? 'individual'}`. `settings/page.tsx:103` becomes `registration_type: selectedType ? selectedType.registrationUnit : (event.registration_type ?? 'individual'),`.

Re-run tsc: only the 2 pre-existing BrandingClient errors remain.

- [ ] **Step 5: Run the full suite** — `npx vitest run` → all green.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/occasions/kind.ts __tests__/lib/occasions/kind.test.ts components/registration/RegistrationForm.tsx "app/(admin)/[orgSlug]/[eventSlug]/assignments/print/page.tsx" "app/(admin)/[orgSlug]/[eventSlug]/reports/page.tsx" "app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx"
git commit -m "feat(occasions): Event kind/location/hours/booth_fee/series_id + EventSeries types; registration_type/features optional (R1)"
```

---

### Task 2: Pure series occurrence engine

**Files:**
- Create: `lib/occasions/series-logic.ts`
- Test: `__tests__/lib/occasions/series-logic.test.ts`

**Interfaces:**
- Consumes: `SeriesRecurrence` (Task 1).
- Produces: `SERIES_OCCURRENCE_CAP = 30`; `seriesOccurrences(rec: SeriesRecurrence): string[]` — every YYYY-MM-DD in [from, until] falling on `weekday`, ascending; returns `[]` when none; throws `Error` naming the cap when the count would exceed 30. Pure string/date math, no timezone use.

- [ ] **Step 1: Write the failing test** — `__tests__/lib/occasions/series-logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seriesOccurrences, SERIES_OCCURRENCE_CAP } from '@/lib/occasions/series-logic'

const rec = (from: string, until: string, weekday = 6) =>
  ({ freq: 'weekly' as const, weekday, from, until })

describe('seriesOccurrences', () => {
  it('generates every Saturday in the window, inclusive of both ends', () => {
    // 2026-05-02 is a Saturday; 2026-05-30 is a Saturday.
    expect(seriesOccurrences(rec('2026-05-02', '2026-05-30'))).toEqual([
      '2026-05-02', '2026-05-09', '2026-05-16', '2026-05-23', '2026-05-30',
    ])
  })
  it('starts at the first matching weekday ON or AFTER from', () => {
    // 2026-05-01 is a Friday → first Saturday is 05-02.
    expect(seriesOccurrences(rec('2026-05-01', '2026-05-09'))[0]).toBe('2026-05-02')
  })
  it('excludes days past until', () => {
    // until on a Friday → the following Saturday is out.
    expect(seriesOccurrences(rec('2026-05-02', '2026-05-29')).at(-1)).toBe('2026-05-23')
  })
  it('returns [] when the window contains no matching weekday', () => {
    // Sun 2026-05-03 .. Fri 2026-05-08 contains no Saturday.
    expect(seriesOccurrences(rec('2026-05-03', '2026-05-08'))).toEqual([])
  })
  it('crosses month and DST boundaries with pure date math', () => {
    // March 2026 DST shift (US) must not skip or duplicate a week.
    const days = seriesOccurrences(rec('2026-03-01', '2026-03-31', 0)) // Sundays
    expect(days).toEqual(['2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29'])
  })
  it(`throws naming the cap when occurrences exceed ${SERIES_OCCURRENCE_CAP}`, () => {
    expect(() => seriesOccurrences(rec('2026-01-03', '2026-12-26'))).toThrow(String(SERIES_OCCURRENCE_CAP))
  })
  it('validates inputs', () => {
    expect(() => seriesOccurrences(rec('nope', '2026-05-30'))).toThrow('date')
    expect(() => seriesOccurrences(rec('2026-05-30', '2026-05-02'))).toThrow('after')
    expect(() => seriesOccurrences({ freq: 'weekly', weekday: 7, from: '2026-05-02', until: '2026-05-30' })).toThrow('weekday')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/occasions/series-logic.test.ts` — FAIL, module missing.

- [ ] **Step 3: Implement** `lib/occasions/series-logic.ts`:

```ts
import type { SeriesRecurrence } from '@/lib/types'

export const SERIES_OCCURRENCE_CAP = 30

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// UTC-noon anchoring makes weekday/date arithmetic immune to DST and the
// host timezone — the strings in and out are plain calendar dates.
function toUtc(day: string): Date {
  return new Date(`${day}T12:00:00Z`)
}
function toDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Every date in [from, until] falling on `weekday`, ascending. Pure calendar
 * math; throws when the season would exceed SERIES_OCCURRENCE_CAP days —
 * "Extend series" generates further spans later (spec §3.2).
 */
export function seriesOccurrences(rec: SeriesRecurrence): string[] {
  if (rec.freq !== 'weekly') throw new Error('Only weekly series are supported')
  if (!Number.isInteger(rec.weekday) || rec.weekday < 0 || rec.weekday > 6) {
    throw new Error('Invalid weekday')
  }
  if (!DAY_RE.test(rec.from) || !DAY_RE.test(rec.until)) {
    throw new Error('Series dates must be YYYY-MM-DD')
  }
  const from = toUtc(rec.from)
  const until = toUtc(rec.until)
  if (until.getTime() < from.getTime()) throw new Error('A series must end after it starts')

  const first = new Date(from)
  const delta = (rec.weekday - first.getUTCDay() + 7) % 7
  first.setUTCDate(first.getUTCDate() + delta)

  const days: string[] = []
  for (const d = new Date(first); d.getTime() <= until.getTime(); d.setUTCDate(d.getUTCDate() + 7)) {
    days.push(toDay(d))
    if (days.length > SERIES_OCCURRENCE_CAP) {
      throw new Error(`A series can generate at most ${SERIES_OCCURRENCE_CAP} days — shorten the season and extend it later`)
    }
  }
  return days
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run __tests__/lib/occasions/series-logic.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/occasions/series-logic.ts __tests__/lib/occasions/series-logic.test.ts
git commit -m "feat(occasions): pure weekly series occurrence engine (cap 30)"
```

---

### Task 3: Events core — occasion fields, R1 create/duplicate changes

**Files:**
- Modify: `lib/events.ts`, `actions/events.ts`
- Test: `__tests__/lib/events.test.ts`, `__tests__/actions/duplicate-event.test.ts`, `__tests__/actions/events.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `CreateEventCoreInput` gains `kind?: EventKind`, `location?: EventLocation`, `hours?: EventHours`, `booth_fee?: number`, `series_id?: string`, `status?: 'draft' | 'active'`, and `registration_type` becomes OPTIONAL; `createEventCore` writes occasion fields conditionally, writes `registration_type` only when provided, **no longer writes `features`**, uses `status: input.status ?? 'draft'`. `updateEvent`'s Pick gains `'location' | 'hours' | 'booth_fee'` (kind/series_id are immutable after create). `duplicateEvent` stops copying `features`, copies `kind`/`location`/`hours`/`booth_fee` when present, copies `registration_type` only when present, and never copies `series_id` (a duplicate is standalone). Later tasks rely on: `createEventCore(orgId, { kind: 'market_day', status: 'active', … })`.

- [ ] **Step 1: Write the failing tests.** Extend `__tests__/lib/events.test.ts` (match its existing firebase mock — the file mocks `@/lib/firebase-admin` with an events collection `doc()/set()` spy chain and a slug-query `get` spy):

```ts
  it('createEventCore writes occasion fields and honors the status override', async () => {
    const event = await createEventCore('org-1', {
      name: 'Boise Farmers Market',
      year: 2026,
      kind: 'market_day',
      status: 'active',
      event_start: '2026-05-02',
      event_end: '2026-05-02',
      location: { name: 'Capitol Blvd' },
      hours: { start: '08:00', end: '13:00' },
      booth_fee: 45,
      series_id: 'series-1',
    })
    expect(event.kind).toBe('market_day')
    expect(event.status).toBe('active')
    expect(event.location).toEqual({ name: 'Capitol Blvd' })
    expect(event.hours).toEqual({ start: '08:00', end: '13:00' })
    expect(event.booth_fee).toBe(45)
    expect(event.series_id).toBe('series-1')
    expect(event).not.toHaveProperty('registration_type')
    expect(event).not.toHaveProperty('features')
  })

  it('createEventCore still writes registration_type when provided and defaults status draft', async () => {
    const event = await createEventCore('org-1', {
      name: 'Wedding', year: 2026, registration_type: 'individual',
      event_start: '2026-09-01', event_end: '2026-09-01',
    })
    expect(event.registration_type).toBe('individual')
    expect(event.status).toBe('draft')
    expect(event).not.toHaveProperty('features')
    expect(event).not.toHaveProperty('kind')
  })
```

Extend `__tests__/actions/duplicate-event.test.ts` (its source fixture already has features + registration_type; use the existing spies):

```ts
  it('duplicate no longer copies features and carries occasion fields when present', async () => {
    // extend the source fixture in this test with occasion fields:
    // kind: 'market_day', location: { name: 'Capitol Blvd' }, hours: { start: '08:00', end: '13:00' }, booth_fee: 45, series_id: 'series-1'
    const event = await duplicateEvent('org-1', 'source-1', {
      name: 'Copy', year: 2026, event_start: '2026-06-06', event_end: '2026-06-06',
    })
    const written = newEventSetSpy.mock.calls.at(-1)![0]
    expect(written).not.toHaveProperty('features')
    expect(written).not.toHaveProperty('series_id')      // duplicates are standalone
    expect(written.kind).toBe('market_day')
    expect(written.location).toEqual({ name: 'Capitol Blvd' })
    expect(written.hours).toEqual({ start: '08:00', end: '13:00' })
    expect(written.booth_fee).toBe(45)
  })
```

(Adapt the spy name to that file's actual one; the audit confirms its final-payload assertion uses `objectContaining`, so existing cases stay green.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/events.test.ts __tests__/actions/duplicate-event.test.ts` — FAIL (unknown input fields / features still copied).

- [ ] **Step 3: Implement.** In `lib/events.ts`, replace `CreateEventCoreInput` and `createEventCore`:

```ts
export interface CreateEventCoreInput {
  name: string
  year: number
  registration_type?: EventRegistrationType   // optional since occasions R1
  event_type_id?: string
  event_type_terminology?: Terminology
  event_start: string
  event_end: string
  department_id?: string | null
  headcount?: number
  lead_id?: string
  kind?: EventKind
  location?: EventLocation
  hours?: EventHours
  booth_fee?: number
  series_id?: string
  status?: 'draft' | 'active'                 // series days are born active (spec §3.2)
}
```

```ts
/** Guard-free event create. Authorization is the caller's responsibility. */
export async function createEventCore(orgId: string, input: CreateEventCoreInput): Promise<Event> {
  const eventRef = eventsRef(orgId).doc()
  const slug = await resolveUniqueEventSlug(orgId, input.name, input.year)
  const event: Event = {
    id: eventRef.id,
    name: input.name,
    slug,
    year: input.year,
    status: input.status ?? 'draft',
    ...(input.registration_type ? { registration_type: input.registration_type } : {}),
    event_type_id: input.event_type_id ?? DEFAULT_EVENT_TYPE_ID,
    ...(input.event_type_terminology ? { event_type_terminology: input.event_type_terminology } : {}),
    ...(input.department_id ? { department_id: input.department_id } : {}),
    ...(input.headcount !== undefined ? { headcount: input.headcount } : {}),
    ...(input.lead_id ? { lead_id: input.lead_id } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.hours ? { hours: input.hours } : {}),
    ...(input.booth_fee !== undefined ? { booth_fee: input.booth_fee } : {}),
    ...(input.series_id ? { series_id: input.series_id } : {}),
    event_start: input.event_start,
    event_end: input.event_end,
    created_at: new Date().toISOString(),
  }
  await eventRef.set(event)
  return event
}
```

(The `features` block is deleted — R1; audit confirmed zero runtime readers. Update the file's type import line to include `EventKind, EventLocation, EventHours`.)

In `actions/events.ts`: `updateEvent`'s Pick union gains `| 'location' | 'hours' | 'booth_fee'`. In `duplicateEvent`, replace the `registration_type`/`features` lines of `newEvent` with:

```ts
    ...(source.registration_type ? { registration_type: source.registration_type } : {}),
    ...(source.kind ? { kind: source.kind } : {}),
    ...(source.location ? { location: source.location } : {}),
    ...(source.hours ? { hours: source.hours } : {}),
    ...(source.booth_fee !== undefined ? { booth_fee: source.booth_fee } : {}),
```

(No `features:` line; no `series_id` copy.)

- [ ] **Step 4: Run tests** — `npx vitest run __tests__/lib/events.test.ts __tests__/actions/duplicate-event.test.ts __tests__/actions/events.test.ts` → PASS. Then `npx tsc --noEmit` → baseline only.

- [ ] **Step 5: Full suite** — `npx vitest run` → green (convert tests keep passing: their input still provides registration_type).

- [ ] **Step 6: Commit**

```bash
git add lib/events.ts actions/events.ts __tests__/lib/events.test.ts __tests__/actions/duplicate-event.test.ts
git commit -m "feat(occasions): createEventCore occasion fields + status override; R1 stops writing features"
```

---

### Task 4: Series core — CRUD, generation, propagate, extend, end

**Files:**
- Create: `lib/occasions/series.ts`
- Test: `__tests__/lib/occasions/series.test.ts`

**Interfaces:**
- Consumes: `seriesOccurrences` (Task 2); `createEventCore`, `eventsRef` (Task 3); `EventSeries`, `SeriesRecurrence` types (Task 1).
- Produces in `@/lib/occasions/series`: `seriesRef(orgId)` (`orgs/{orgId}/event_series`); `CreateSeriesInput { name; location; hours; recurrence; booth_fee?; event_type_id? }`; `createSeriesCore(orgId, input): Promise<{ series: EventSeries; created: number }>`; `getSeriesCore(orgId, seriesId): Promise<EventSeries | null>`; `listSeriesCore(orgId): Promise<EventSeries[]>`; `listSeriesDaysCore(orgId, seriesId): Promise<Event[]>` (ascending by event_start); `SeriesUpdate { name?; location?; hours?; booth_fee?: number | null }`; `updateSeriesCore(orgId, seriesId, updates, opts?: { propagate?: boolean; today?: string }): Promise<void>`; `extendSeriesCore(orgId, seriesId, newUntil: string): Promise<{ created: number }>`; `endSeriesCore(orgId, seriesId, opts?: { today?: string }): Promise<{ archived: number }>`. Generation idempotency: a day is skipped when an event with this `series_id` + `event_start` already exists.

- [ ] **Step 1: Write the failing tests** — `__tests__/lib/occasions/series.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const seriesSetSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const seriesGetSpy = vi.hoisted(() => vi.fn())
const seriesUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const seriesListGetSpy = vi.hoisted(() => vi.fn())
const daysQueryGetSpy = vi.hoisted(() => vi.fn())
const eventUpdateSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const createEventCoreSpy = vi.hoisted(() => vi.fn())

vi.mock('@/lib/firebase-admin', () => {
  const seriesCol = {
    doc: vi.fn().mockImplementation((id?: string) => ({
      id: id ?? 'new-series-id',
      set: seriesSetSpy,
      get: seriesGetSpy,
      update: seriesUpdateSpy,
    })),
    orderBy: vi.fn().mockReturnValue({ get: seriesListGetSpy }),
  }
  const eventsCol = {
    where: vi.fn().mockReturnValue({ get: daysQueryGetSpy }),
    doc: vi.fn().mockImplementation((id: string) => ({ id, update: eventUpdateSpy })),
  }
  const orgDoc = {
    collection: vi.fn().mockImplementation((sub: string) =>
      sub === 'event_series' ? seriesCol : sub === 'events' ? eventsCol : {}),
  }
  return { adminDb: { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(orgDoc) }) } }
})

// series.ts builds its own events collection ref from adminDb (it does NOT
// import eventsRef), so the firebase mock above covers day queries/updates —
// only createEventCore needs stubbing here.
vi.mock('@/lib/events', () => ({ createEventCore: createEventCoreSpy }))

import { createSeriesCore, extendSeriesCore, endSeriesCore, updateSeriesCore } from '@/lib/occasions/series'

const INPUT = {
  name: 'Boise Farmers Market',
  location: { name: 'Capitol Blvd' },
  hours: { start: '08:00', end: '13:00' },
  recurrence: { freq: 'weekly' as const, weekday: 6, from: '2026-05-02', until: '2026-05-16' },
  booth_fee: 45,
}

describe('createSeriesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    daysQueryGetSpy.mockResolvedValue({ docs: [] })
    createEventCoreSpy.mockImplementation(async (_org: string, i: { event_start: string }) =>
      ({ id: `ev-${i.event_start}`, event_start: i.event_start }))
  })

  it('writes the series then one active market-day event per occurrence', async () => {
    const { series, created } = await createSeriesCore('org-1', INPUT)
    expect(created).toBe(3) // 05-02, 05-09, 05-16
    expect(seriesSetSpy).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Boise Farmers Market', kind: 'market_day', active: true,
    }))
    expect(createEventCoreSpy).toHaveBeenCalledTimes(3)
    expect(createEventCoreSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({
      kind: 'market_day', status: 'active', name: 'Boise Farmers Market',
      event_start: '2026-05-02', event_end: '2026-05-02',
      location: { name: 'Capitol Blvd' }, hours: { start: '08:00', end: '13:00' },
      booth_fee: 45, series_id: series.id,
    }))
  })

  it('is idempotent per (series, day): existing days are skipped', async () => {
    daysQueryGetSpy.mockResolvedValue({ docs: [{ data: () => ({ event_start: '2026-05-09', status: 'active' }) }] })
    const { created } = await createSeriesCore('org-1', INPUT)
    expect(created).toBe(2)
    const starts = createEventCoreSpy.mock.calls.map((c) => c[1].event_start)
    expect(starts).toEqual(['2026-05-02', '2026-05-16'])
  })

  it('rejects an empty season and bad hours', async () => {
    await expect(createSeriesCore('org-1', {
      ...INPUT, recurrence: { ...INPUT.recurrence, from: '2026-05-03', until: '2026-05-08' },
    })).rejects.toThrow('no days')
    await expect(createSeriesCore('org-1', {
      ...INPUT, hours: { start: '13:00', end: '08:00' },
    })).rejects.toThrow('hours')
  })
})

describe('extendSeriesCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createEventCoreSpy.mockImplementation(async (_o: string, i: { event_start: string }) => ({ id: 'x', event_start: i.event_start }))
    seriesGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 's1', ...INPUT, kind: 'market_day', active: true, created_at: 'x',
    }) })
    daysQueryGetSpy.mockResolvedValue({ docs: [
      { data: () => ({ event_start: '2026-05-02' }) },
      { data: () => ({ event_start: '2026-05-09' }) },
      { data: () => ({ event_start: '2026-05-16' }) },
    ] })
  })

  it('generates only the delta and bumps until', async () => {
    const { created } = await extendSeriesCore('org-1', 's1', '2026-05-30')
    expect(created).toBe(2) // 05-23, 05-30
    expect(seriesUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
      recurrence: expect.objectContaining({ until: '2026-05-30' }),
    }))
  })

  it('rejects a shrink', async () => {
    await expect(extendSeriesCore('org-1', 's1', '2026-05-09')).rejects.toThrow('later')
    expect(createEventCoreSpy).not.toHaveBeenCalled()
  })
})

describe('endSeriesCore / updateSeriesCore propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seriesGetSpy.mockResolvedValue({ exists: true, data: () => ({
      id: 's1', ...INPUT, kind: 'market_day', active: true, created_at: 'x',
    }) })
    daysQueryGetSpy.mockResolvedValue({ docs: [
      { data: () => ({ id: 'd1', event_start: '2026-05-02', status: 'active' }) },   // past
      { data: () => ({ id: 'd2', event_start: '2026-05-09', status: 'archived' }) }, // skipped week
      { data: () => ({ id: 'd3', event_start: '2026-05-16', status: 'active' }) },   // future
    ] })
  })

  it('endSeriesCore deactivates and archives only future non-archived days', async () => {
    const { archived } = await endSeriesCore('org-1', 's1', { today: '2026-05-05' })
    expect(archived).toBe(1)
    expect(seriesUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
    expect(eventUpdateSpy).toHaveBeenCalledTimes(1)
    expect(eventUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }))
  })

  it('updateSeriesCore with propagate updates only future non-archived days', async () => {
    await updateSeriesCore('org-1', 's1', { booth_fee: 55, hours: { start: '09:00', end: '14:00' } },
      { propagate: true, today: '2026-05-05' })
    expect(eventUpdateSpy).toHaveBeenCalledTimes(1)
    expect(eventUpdateSpy).toHaveBeenCalledWith(expect.objectContaining({
      booth_fee: 55, hours: { start: '09:00', end: '14:00' },
    }))
  })

  it('updateSeriesCore without propagate touches no days', async () => {
    await updateSeriesCore('org-1', 's1', { booth_fee: 55 })
    expect(eventUpdateSpy).not.toHaveBeenCalled()
    expect(seriesUpdateSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail** — module missing.

- [ ] **Step 3: Implement** `lib/occasions/series.ts`:

```ts
import { adminDb } from '@/lib/firebase-admin'
import { randomBytes } from 'crypto'
import { createEventCore } from '@/lib/events'
import { seriesOccurrences } from '@/lib/occasions/series-logic'
import type { Event, EventHours, EventLocation, EventSeries, SeriesRecurrence } from '@/lib/types'

export interface CreateSeriesInput {
  name: string
  location: EventLocation
  hours: EventHours
  recurrence: SeriesRecurrence
  booth_fee?: number
  event_type_id?: string
}

export interface SeriesUpdate {
  name?: string
  location?: EventLocation
  hours?: EventHours
  booth_fee?: number | null
}

export function seriesRef(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('event_series')
}

function eventsCol(orgId: string) {
  return adminDb.collection('orgs').doc(orgId).collection('events')
}

const TIME_RE = /^\d{2}:\d{2}$/

function validateHours(hours: EventHours): void {
  if (!TIME_RE.test(hours.start) || !TIME_RE.test(hours.end) || hours.start >= hours.end) {
    throw new Error('Please enter valid hours (start before end)')
  }
}

/** Days already generated for a series, ascending. */
export async function listSeriesDaysCore(orgId: string, seriesId: string): Promise<Event[]> {
  const snap = await eventsCol(orgId).where('series_id', '==', seriesId).get()
  return snap.docs.map((d) => d.data() as Event).sort((a, b) => a.event_start.localeCompare(b.event_start))
}

// Generation shared by create + extend. Idempotent per (series, day): a day
// with an existing event (any status — archived means deliberately skipped)
// is never re-created (spec §3.2).
async function generateDays(orgId: string, series: EventSeries, days: string[]): Promise<number> {
  const existing = new Set((await listSeriesDaysCore(orgId, series.id)).map((e) => e.event_start))
  let created = 0
  for (const day of days) {
    if (existing.has(day)) continue
    await createEventCore(orgId, {
      name: series.name,
      year: Number(day.slice(0, 4)),
      kind: 'market_day',
      status: 'active',
      event_start: day,
      event_end: day,
      location: series.location,
      hours: series.hours,
      ...(series.booth_fee !== undefined ? { booth_fee: series.booth_fee } : {}),
      ...(series.event_type_id ? { event_type_id: series.event_type_id } : {}),
      series_id: series.id,
    })
    created++
  }
  return created
}

/** Guard-free create: series doc + every day in the season, up-front (spec §3.2). */
export async function createSeriesCore(
  orgId: string,
  input: CreateSeriesInput,
): Promise<{ series: EventSeries; created: number }> {
  if (!input.name?.trim()) throw new Error('Name is required')
  if (!input.location?.name?.trim()) throw new Error('Location is required')
  validateHours(input.hours)
  if (input.booth_fee !== undefined && !(input.booth_fee >= 0)) throw new Error('Invalid booth fee')
  const days = seriesOccurrences(input.recurrence)
  if (days.length === 0) throw new Error('This schedule produces no days — check the weekday and dates')

  const id = randomBytes(8).toString('hex')
  const series: EventSeries = {
    id,
    name: input.name.trim(),
    kind: 'market_day',
    location: { name: input.location.name.trim(), ...(input.location.address?.trim() ? { address: input.location.address.trim() } : {}) },
    hours: input.hours,
    recurrence: input.recurrence,
    ...(input.booth_fee !== undefined ? { booth_fee: input.booth_fee } : {}),
    ...(input.event_type_id ? { event_type_id: input.event_type_id } : {}),
    active: true,
    created_at: new Date().toISOString(),
  }
  await seriesRef(orgId).doc(id).set(series)
  const created = await generateDays(orgId, series, days)
  return { series, created }
}

export async function getSeriesCore(orgId: string, seriesId: string): Promise<EventSeries | null> {
  const snap = await seriesRef(orgId).doc(seriesId).get()
  return snap.exists ? (snap.data() as EventSeries) : null
}

export async function listSeriesCore(orgId: string): Promise<EventSeries[]> {
  const snap = await seriesRef(orgId).orderBy('created_at', 'desc').get()
  return snap.docs.map((d) => d.data() as EventSeries)
}

/**
 * Update series fields; with opts.propagate, bulk-apply location/hours/
 * booth_fee/name to FUTURE (event_start >= today), NON-ARCHIVED days of this
 * series. Archived (skipped) days stay skipped (spec §3.2). Individually
 * edited day fields are overwritten by propagation — documented behavior.
 */
export async function updateSeriesCore(
  orgId: string,
  seriesId: string,
  updates: SeriesUpdate,
  opts?: { propagate?: boolean; today?: string },
): Promise<void> {
  const series = await getSeriesCore(orgId, seriesId)
  if (!series) throw new Error('Series not found')
  if (updates.hours) validateHours(updates.hours)
  if (updates.name !== undefined && !updates.name.trim()) throw new Error('Name is required')

  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) continue
    cleaned[k] = v
  }
  await seriesRef(orgId).doc(seriesId).update({ ...cleaned, updated_at: new Date().toISOString() })

  if (opts?.propagate) {
    const today = opts.today ?? new Date().toISOString().slice(0, 10)
    const days = (await listSeriesDaysCore(orgId, seriesId))
      .filter((d) => d.event_start >= today && d.status !== 'archived')
    const dayPatch: Record<string, unknown> = {}
    if (updates.name !== undefined) dayPatch.name = updates.name.trim()
    if (updates.location !== undefined) dayPatch.location = updates.location
    if (updates.hours !== undefined) dayPatch.hours = updates.hours
    if (updates.booth_fee !== undefined && updates.booth_fee !== null) dayPatch.booth_fee = updates.booth_fee
    for (const day of days) {
      await eventsCol(orgId).doc(day.id).update({ ...dayPatch, updated_at: new Date().toISOString() })
    }
  }
}

/** Raise `until` and generate the delta (idempotent). */
export async function extendSeriesCore(orgId: string, seriesId: string, newUntil: string): Promise<{ created: number }> {
  const series = await getSeriesCore(orgId, seriesId)
  if (!series) throw new Error('Series not found')
  if (newUntil <= series.recurrence.until) throw new Error('The new end date must be later than the current one')
  const recurrence: SeriesRecurrence = { ...series.recurrence, until: newUntil }
  const days = seriesOccurrences(recurrence)
  const created = await generateDays(orgId, { ...series, recurrence }, days)
  await seriesRef(orgId).doc(seriesId).update({ recurrence, updated_at: new Date().toISOString() })
  return { created }
}

/** End the season: deactivate + archive future non-archived days. */
export async function endSeriesCore(orgId: string, seriesId: string, opts?: { today?: string }): Promise<{ archived: number }> {
  const series = await getSeriesCore(orgId, seriesId)
  if (!series) throw new Error('Series not found')
  const today = opts?.today ?? new Date().toISOString().slice(0, 10)
  const future = (await listSeriesDaysCore(orgId, seriesId))
    .filter((d) => d.event_start >= today && d.status !== 'archived')
  for (const day of future) {
    await eventsCol(orgId).doc(day.id).update({ status: 'archived', updated_at: new Date().toISOString() })
  }
  await seriesRef(orgId).doc(seriesId).update({ active: false, updated_at: new Date().toISOString() })
  return { archived: future.length }
}
```


- [ ] **Step 4: Run tests** — `npx vitest run __tests__/lib/occasions/series.test.ts` → PASS. `npx tsc --noEmit` → baseline only.

- [ ] **Step 5: Commit**

```bash
git add lib/occasions/series.ts __tests__/lib/occasions/series.test.ts
git commit -m "feat(occasions): series core — up-front idempotent generation, propagate, extend, end"
```

---

### Task 5: Actions — series wrappers, createMarketDay, convert kind

**Files:**
- Create: `actions/series.ts`
- Modify: `actions/events.ts` (add `createMarketDay`), `lib/crm/convert.ts` (ConvertToWorkInput.kind), `actions/leads.ts` only if its convert wrapper narrows the input type (it passes through — verify, no change expected)
- Test: `__tests__/actions/series.test.ts`, extend `__tests__/lib/crm/convert.test.ts`

**Interfaces:**
- Consumes: Task 4 cores; `assertOrgMember`/`assertOrgAdmin`.
- Produces: `@/actions/series`: `createSeries(orgId, input)`, `getSeries(orgId, seriesId)`, `listSeries(orgId)`, `listSeriesDays(orgId, seriesId)`, `updateSeries(orgId, seriesId, updates, opts?)`, `extendSeries(orgId, seriesId, newUntil)`, `endSeries(orgId, seriesId)` — reads `assertOrgMember`, writes `assertOrgAdmin`. `@/actions/events`: `createMarketDay(orgId, { name, date, location, hours?, booth_fee? }): Promise<Event>` (admin; `kind:'market_day'`, `status:'active'`, `event_start=event_end=date`, YYYY-MM-DD validated). `lib/crm/convert.ts`: `ConvertToWorkInput` gains `kind?: EventKind` and `registration_type` becomes optional; core passes both through to `createEventCore`.

- [ ] **Step 1: Write the failing tests.** `__tests__/actions/series.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const assertOrgMemberSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'staff' }))
const assertOrgAdminSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ role: 'admin' }))
const cores = vi.hoisted(() => ({
  createSeriesCore: vi.fn().mockResolvedValue({ series: { id: 's1' }, created: 3 }),
  getSeriesCore: vi.fn().mockResolvedValue({ id: 's1' }),
  listSeriesCore: vi.fn().mockResolvedValue([]),
  listSeriesDaysCore: vi.fn().mockResolvedValue([]),
  updateSeriesCore: vi.fn().mockResolvedValue(undefined),
  extendSeriesCore: vi.fn().mockResolvedValue({ created: 2 }),
  endSeriesCore: vi.fn().mockResolvedValue({ archived: 1 }),
}))

vi.mock('@/lib/auth/assert', () => ({ assertOrgMember: assertOrgMemberSpy, assertOrgAdmin: assertOrgAdminSpy }))
vi.mock('@/lib/occasions/series', () => cores)

import { createSeries, listSeries, updateSeries, endSeries } from '@/actions/series'

describe('series actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads gate on membership, writes on admin', async () => {
    await listSeries('org-1')
    expect(assertOrgMemberSpy).toHaveBeenCalledWith('org-1')
    await createSeries('org-1', {} as never)
    await updateSeries('org-1', 's1', {})
    await endSeries('org-1', 's1')
    expect(assertOrgAdminSpy).toHaveBeenCalledTimes(3)
  })

  it('passes propagate options through', async () => {
    await updateSeries('org-1', 's1', { booth_fee: 55 }, { propagate: true })
    expect(cores.updateSeriesCore).toHaveBeenCalledWith('org-1', 's1', { booth_fee: 55 }, { propagate: true })
  })
})
```

Extend `__tests__/lib/crm/convert.test.ts` (its mock already stubs `createEventCore` and a won lead — add):

```ts
  it('passes kind through to the created event', async () => {
    await convertOpportunityToWorkCore('org-1', 'lead-1', {
      name: 'Market stall', date: '2026-06-06',
      event_type_id: 'coffee-service', kind: 'market_day',
    })
    expect(createEventCoreSpy).toHaveBeenCalledWith('org-1', expect.objectContaining({ kind: 'market_day' }))
    // registration_type omitted → not forwarded
    const arg = createEventCoreSpy.mock.calls[0][1]
    expect(arg).not.toHaveProperty('registration_type')
  })
```

- [ ] **Step 2: Run to verify failure** — actions/series missing; convert rejects unknown field.

- [ ] **Step 3: Implement.** `actions/series.ts`:

```ts
'use server'

import { assertOrgMember, assertOrgAdmin } from '@/lib/auth/assert'
import {
  createSeriesCore, getSeriesCore, listSeriesCore, listSeriesDaysCore,
  updateSeriesCore, extendSeriesCore, endSeriesCore,
  type CreateSeriesInput, type SeriesUpdate,
} from '@/lib/occasions/series'
import type { Event, EventSeries } from '@/lib/types'

export async function createSeries(orgId: string, input: CreateSeriesInput): Promise<{ series: EventSeries; created: number }> {
  await assertOrgAdmin(orgId)
  return createSeriesCore(orgId, input)
}

export async function getSeries(orgId: string, seriesId: string): Promise<EventSeries | null> {
  await assertOrgMember(orgId)
  return getSeriesCore(orgId, seriesId)
}

export async function listSeries(orgId: string): Promise<EventSeries[]> {
  await assertOrgMember(orgId)
  return listSeriesCore(orgId)
}

export async function listSeriesDays(orgId: string, seriesId: string): Promise<Event[]> {
  await assertOrgMember(orgId)
  return listSeriesDaysCore(orgId, seriesId)
}

export async function updateSeries(orgId: string, seriesId: string, updates: SeriesUpdate, opts?: { propagate?: boolean }): Promise<void> {
  await assertOrgAdmin(orgId)
  return updateSeriesCore(orgId, seriesId, updates, opts)
}

export async function extendSeries(orgId: string, seriesId: string, newUntil: string): Promise<{ created: number }> {
  await assertOrgAdmin(orgId)
  return extendSeriesCore(orgId, seriesId, newUntil)
}

export async function endSeries(orgId: string, seriesId: string): Promise<{ archived: number }> {
  await assertOrgAdmin(orgId)
  return endSeriesCore(orgId, seriesId)
}
```

Add to `actions/events.ts`:

```ts
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Direct market-day creation (spec §3.1/§6: "+ New → Market day"). Born active — no draft gate. */
export async function createMarketDay(
  orgId: string,
  input: {
    name: string
    date: string
    location: { name: string; address?: string }
    hours?: { start: string; end: string }
    booth_fee?: number
  },
): Promise<Event> {
  await assertOrgAdmin(orgId)
  if (!input.name?.trim()) throw new Error('A name is required')
  if (!DAY_RE.test(input.date ?? '')) throw new Error('Pick a valid date')
  if (!input.location?.name?.trim()) throw new Error('A location is required')
  return createEventCore(orgId, {
    name: input.name.trim(),
    year: Number(input.date.slice(0, 4)),
    kind: 'market_day',
    status: 'active',
    event_start: input.date,
    event_end: input.date,
    location: { name: input.location.name.trim(), ...(input.location.address?.trim() ? { address: input.location.address.trim() } : {}) },
    ...(input.hours ? { hours: input.hours } : {}),
    ...(input.booth_fee !== undefined ? { booth_fee: input.booth_fee } : {}),
  })
}
```

In `lib/crm/convert.ts`, `ConvertToWorkInput`: `registration_type?: EventRegistrationType` (optional) and add `kind?: EventKind`; in the `createEventCore` call replace the `registration_type:` line with conditional spreads:

```ts
    ...(input.registration_type ? { registration_type: input.registration_type } : {}),
    ...(input.kind ? { kind: input.kind } : {}),
```

(Import `EventKind` type.)

- [ ] **Step 4: Run tests** — the two new files + `__tests__/actions/convert.test.ts` + `__tests__/actions/events.test.ts` → PASS; `npx tsc --noEmit` → baseline.

- [ ] **Step 5: Commit**

```bash
git add actions/series.ts actions/events.ts lib/crm/convert.ts __tests__/actions/series.test.ts __tests__/lib/crm/convert.test.ts
git commit -m "feat(occasions): series actions, createMarketDay, convert-to-work kind"
```

---

### Task 6: ConvertToWorkCard kind choice

**Files:**
- Modify: `components/admin/opportunity/ConvertToWorkCard.tsx`
- Test: extend `__tests__/components/opportunity/ConvertToWorkCard.test.tsx`

**Interfaces:**
- Consumes: `convertOpportunityToWork` (unchanged wrapper — its input type is `ConvertToWorkInput`, already extended in Task 5); `EVENT_KIND_LABELS` (Task 1).
- Produces: the convert form gains an explicit "What kind of job?" select (`Client job` default / `Market day`), passed as `kind`; when `Market day` is chosen the event-type select stays (terminology still applies) and the card's copy switches its next-step hint. Kind is ALWAYS explicit — no title heuristics (spec §10 edge cases).

- [ ] **Step 1: Write the failing test** — extend the existing file (it renders the card with a won lead fixture and spies on `convertOpportunityToWork`):

```tsx
  it('passes the chosen kind to convert', async () => {
    render(<ConvertToWorkCard orgId="org-1" orgSlug="acme" lead={wonLead} job={null} eventTypes={types} open />)
    fireEvent.change(screen.getByLabelText(/kind/i), { target: { value: 'market_day' } })
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
    await waitFor(() => expect(convertSpy).toHaveBeenCalledWith('org-1', wonLead.id,
      expect.objectContaining({ kind: 'market_day' })))
  })

  it('defaults to client_job (kind omitted or client_job — no market fields sent)', async () => {
    render(<ConvertToWorkCard orgId="org-1" orgSlug="acme" lead={wonLead} job={null} eventTypes={types} open />)
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }))
    await waitFor(() => expect(convertSpy).toHaveBeenCalled())
    const arg = convertSpy.mock.calls[0][2]
    expect(arg.kind ?? 'client_job').toBe('client_job')
  })
```

(Adapt fixture/spy names to the file's own.)

- [ ] **Step 2: Run to verify failure** — no kind select exists.

- [ ] **Step 3: Implement.** In `ConvertToWorkCard.tsx`: add state `const [kind, setKind] = useState<EventKind>('client_job')` (import `type EventKind` from `@/lib/types` and `EVENT_KIND_LABELS` from `@/lib/occasions/kind`); in the form grid add before the event-type select:

```tsx
          <div className="space-y-1">
            <Label htmlFor="cw-kind">Kind</Label>
            <select
              id="cw-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as EventKind)}
              className="block h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {(Object.entries(EVENT_KIND_LABELS) as Array<[EventKind, string]>).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
```

and in `handleConvert` include `...(kind === 'market_day' ? { kind } : {})` in the payload (client_job stays implicit — zero-migration default). Swap the next-step hint line:

```tsx
        <p className="text-sm text-muted-foreground">
          {kind === 'market_day'
            ? 'Next you can set the location and hours on the day’s settings.'
            : 'Next you’ll pick packages and requirements on the job’s ops page.'}
        </p>
```

- [ ] **Step 4: Run tests** — `npx vitest run __tests__/components/opportunity/ConvertToWorkCard.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/opportunity/ConvertToWorkCard.tsx __tests__/components/opportunity/ConvertToWorkCard.test.tsx
git commit -m "feat(occasions): explicit kind choice on convert-to-work"
```

---

### Task 7: Settings — roster-field gating + market-day fields

**Files:**
- Modify: `app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx`
- Test: none new (client settings page has no existing suite; `npx next build` + tsc gate; behavior pinned in Task 12's manual-walk notes)

**Interfaces:**
- Consumes: `kindOf` (Task 1); `updateEvent` Pick extension (Task 3: `location`/`hours`/`booth_fee`); the page already imports `resolveEnabledModules`.
- Produces: (a) the four roster-era inputs — registration open/close dates, "Capacity cap", "Payment amount" — render ONLY when `resolveEnabledModules(org.industry_pack_id).includes('attendee-roster')` (R1: they disappear for every booked-job pack); (b) for `kindOf(event) === 'market_day'`: the event-type + registration section is hidden entirely, and a "Market day" section appears with Location name, Address (optional), Hours start/end (`type="time"` inputs), Booth fee (number) — saved through `updateEvent` as `location` / `hours` / `booth_fee` (empty booth fee → `null` to clear; empty hours pair → `null`); (c) the status select keeps working for both kinds (label copy unchanged in this increment).

- [ ] **Step 1: Implement.** In the settings page: after the org load, compute `const rosterEnabled = resolveEnabledModules(org?.industry_pack_id).includes('attendee-roster')` and `const isMarketDay = event ? kindOf(event) === 'market_day' : false`. Wrap the registration-window/capacity/payment JSX block in `{rosterEnabled && !isMarketDay && ( … )}` and the event-type select block in `{!isMarketDay && ( … )}`. Add state seeded from the loaded event:

```tsx
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [hoursStart, setHoursStart] = useState('')
  const [hoursEnd, setHoursEnd] = useState('')
  const [boothFee, setBoothFee] = useState('')
  // in the load effect, after setStatus(c.status):
  setLocationName(c.location?.name ?? '')
  setLocationAddress(c.location?.address ?? '')
  setHoursStart(c.hours?.start ?? '')
  setHoursEnd(c.hours?.end ?? '')
  setBoothFee(c.booth_fee != null ? String(c.booth_fee) : '')
```

Render (market-day only):

```tsx
        {isMarketDay && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Market day</h2>
            <div className="space-y-1">
              <Label htmlFor="md-location">Location name</Label>
              <Input id="md-location" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-address">Address (optional)</Label>
              <Input id="md-address" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="md-start">Opens</Label>
                <Input id="md-start" type="time" value={hoursStart} onChange={(e) => setHoursStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="md-end">Closes</Label>
                <Input id="md-end" type="time" value={hoursEnd} onChange={(e) => setHoursEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-fee">Booth fee ($)</Label>
              <Input id="md-fee" type="number" min="0" step="1" value={boothFee} onChange={(e) => setBoothFee(e.target.value)} />
            </div>
          </div>
        )}
```

And extend the save payload (market-day branch only):

```tsx
        ...(isMarketDay
          ? {
              location: locationName.trim()
                ? { name: locationName.trim(), ...(locationAddress.trim() ? { address: locationAddress.trim() } : {}) }
                : null,
              hours: hoursStart && hoursEnd ? { start: hoursStart, end: hoursEnd } : null,
              booth_fee: boothFee !== '' ? Number(boothFee) : null,
            }
          : {}),
```

(`null` clears via updateEvent's existing null→delete semantics. When `isMarketDay`, also skip sending `registration_type`/`event_type_id` — leave the existing values untouched by passing `undefined`, i.e. omit those keys from the payload in that branch.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit` baseline only; `npx next build` green; `npx vitest run` full suite green.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/[orgSlug]/[eventSlug]/settings/page.tsx"
git commit -m "feat(occasions): settings — market-day fields; roster inputs gated on attendee-roster (R1)"
```

---

### Task 8: Market-day job nav + overview

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`, `app/(admin)/[orgSlug]/[eventSlug]/layout.tsx`, `app/(admin)/[orgSlug]/[eventSlug]/dashboard/page.tsx`
- Create: `components/admin/occasions/MarketDayOverview.tsx`
- Test: extend `__tests__/components/layout/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: `kindOf` (Task 1); `getSeries` naming for the overview's series link (Task 5).
- Produces: `AdminSidebar` gains `eventKind?: EventKind` prop; when inside a job with `eventKind === 'market_day'`, `visibleEventNav` is exactly `[{ key: 'dashboard', label: 'Overview' }, { key: 'settings', label: 'Settings' }]` (inc-1 subset — Register/Closeout land with increment 2; roster/module filters are irrelevant to this explicit list). The event layout passes `eventKind={kindOf(event)}`. The dashboard page branches: market days render `MarketDayOverview` (date, location, hours, booth fee, series backlink) instead of the camp-era stub.

- [ ] **Step 1: Write the failing test** — extend `__tests__/components/layout/AdminSidebar.test.tsx` (its conventions: `nav.pathname`, render with props, `within` scoping):

```tsx
  it('market-day job nav shows only Overview and Settings', () => {
    nav.pathname = '/acme/boise-farmers-market-2026/dashboard'
    render(<AdminSidebar orgSlug="acme" eventSlug="boise-farmers-market-2026" eventKind="market_day" />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/acme/boise-farmers-market-2026/dashboard')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/acme/boise-farmers-market-2026/settings')
    expect(screen.queryByRole('link', { name: 'Event Ops' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Teams' })).not.toBeInTheDocument()
  })

  it('client-job nav is unchanged when eventKind is client_job or absent', () => {
    nav.pathname = '/acme/hendricks/dashboard'
    render(<AdminSidebar orgSlug="acme" eventSlug="hendricks" />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Event Ops' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** AdminSidebar props gain `eventKind?: EventKind` (import the type). Replace the `visibleEventNav` computation:

```tsx
  const MARKET_DAY_NAV = [
    { key: 'dashboard', label: 'Overview' },
    // Register + Closeout join this list with the counter-register increment.
    { key: 'settings', label: 'Settings' },
  ]

  const eventNav = getEventNav(t)
  const visibleEventNav =
    eventKind === 'market_day'
      ? MARKET_DAY_NAV
      : eventNav
          .filter(
            (n) =>
              !allowedEventPages ||
              n.key === 'dashboard' ||
              n.key === 'settings' ||
              allowedEventPages.includes(n.key as EventPage)
          )
          .filter((n) => !ROSTER_KEYS.has(n.key) || has('attendee-roster'))
```

Event layout: `import { kindOf } from '@/lib/occasions/kind'` and pass `eventKind={kindOf(event)}` to `AdminSidebar`.

`components/admin/occasions/MarketDayOverview.tsx` (server-renderable, plain props):

```tsx
import Link from 'next/link'
import type { Event, EventSeries } from '@/lib/types'

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

export function MarketDayOverview({
  orgSlug, event, series,
}: {
  orgSlug: string
  event: Event
  series: EventSeries | null
}) {
  return (
    <div className="p-6 max-w-2xl">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Market day</p>
      <h1 className="text-2xl font-bold">{event.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{event.event_start}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
          <p className="mt-1 font-medium">{event.location?.name ?? 'Not set'}</p>
          {event.location?.address && <p className="text-sm text-muted-foreground">{event.location.address}</p>}
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Hours</p>
          <p className="mt-1 font-medium">
            {event.hours ? `${event.hours.start}–${event.hours.end}` : 'Not set'}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Booth fee</p>
          <p className="mt-1 font-medium">{event.booth_fee != null ? money(event.booth_fee) : 'None'}</p>
        </div>
        {series && (
          <div className="rounded-lg border bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Series</p>
            <Link href={`/${orgSlug}/series/${series.id}`} className="mt-1 inline-block font-medium underline">
              {series.name}
            </Link>
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        The sales register for market days arrives with the next increment — for now, adjust
        details in Settings, and find this day on the calendar and Today.
      </p>
    </div>
  )
}
```

Dashboard page branches (`app/(admin)/[orgSlug]/[eventSlug]/dashboard/page.tsx`):

```tsx
import { requireEvent } from '@/lib/auth/guards'
import { resolveEnabledModules } from '@/lib/industry-packs'
import { kindOf } from '@/lib/occasions/kind'
import { getSeriesCore } from '@/lib/occasions/series'
import { MarketDayOverview } from '@/components/admin/occasions/MarketDayOverview'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventSlug: string }>
}) {
  const { orgSlug, eventSlug } = await params
  const { org, event } = await requireEvent(orgSlug, eventSlug)

  if (kindOf(event) === 'market_day') {
    const series = event.series_id ? await getSeriesCore(org.id, event.series_id) : null
    return <MarketDayOverview orgSlug={orgSlug} event={event} series={series} />
  }

  const enabledModules = resolveEnabledModules(org.industry_pack_id)
  const rosterEnabled = enabledModules.includes('attendee-roster')
  // …existing client-job JSX unchanged below…
```

- [ ] **Step 4: Run tests** — AdminSidebar suite + full suite green; `npx next build` green.

- [ ] **Step 5: Commit**

```bash
git add components/layout/AdminSidebar.tsx "app/(admin)/[orgSlug]/[eventSlug]/layout.tsx" "app/(admin)/[orgSlug]/[eventSlug]/dashboard/page.tsx" components/admin/occasions/MarketDayOverview.tsx __tests__/components/layout/AdminSidebar.test.tsx
git commit -m "feat(occasions): market-day job nav subset + overview page"
```

---

### Task 9: Create pages — chooser, market day, series

**Files:**
- Create: `app/(admin)/[orgSlug]/new/page.tsx`, `app/(admin)/[orgSlug]/new-market-day/page.tsx`, `app/(admin)/[orgSlug]/new-series/page.tsx`
- Modify: `lib/sidebar-nav.ts` (ORG_PAGE_SLUGS += `'new'`, `'new-market-day'`, `'new-series'`, `'series'`), `components/layout/AdminSidebar.tsx` `SECTION_FOR_SLUG` (same four → `'events'`)
- Test: `__tests__/components/admin/occasions/NewOccasionChooser.test.tsx`

**Interfaces:**
- Consumes: `createMarketDay` (Task 5), `createSeries` (Task 5), `SERIES_OCCURRENCE_CAP` (Task 2), storefront gating pattern (`resolveEnabledModules`).
- Produces: `/{orgSlug}/new` — a server page reading the org's modules and rendering the chooser (client links only, no client JS needed): cards for **Client job** → `/new-event`, **Market day** → `/new-market-day`, **Series** → `/new-series`, **Drop** → `/drops/new` (rendered only when the pack has `storefront`). `/{orgSlug}/new-market-day` and `/{orgSlug}/new-series` — `'use client'` create pages in the `/new-event` house pattern, pushing to the created day's dashboard / the series page.

- [ ] **Step 1: Write the failing test** — `__tests__/components/admin/occasions/NewOccasionChooser.test.tsx` (test the chooser as a component; the page wraps it):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NewOccasionChooser } from '@/components/admin/occasions/NewOccasionChooser'

describe('NewOccasionChooser', () => {
  it('links the four doors when storefront is enabled', () => {
    render(<NewOccasionChooser orgSlug="acme" storefrontEnabled dropLabel="Drop" />)
    expect(screen.getByRole('link', { name: /client job/i })).toHaveAttribute('href', '/acme/new-event')
    expect(screen.getByRole('link', { name: /market day/i })).toHaveAttribute('href', '/acme/new-market-day')
    expect(screen.getByRole('link', { name: /series/i })).toHaveAttribute('href', '/acme/new-series')
    expect(screen.getByRole('link', { name: /drop/i })).toHaveAttribute('href', '/acme/drops/new')
  })
  it('hides the Drop door without the storefront module', () => {
    render(<NewOccasionChooser orgSlug="acme" storefrontEnabled={false} dropLabel="Drop" />)
    expect(screen.queryByRole('link', { name: /drop/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `components/admin/occasions/NewOccasionChooser.tsx`:

```tsx
import Link from 'next/link'

const DOORS = (orgSlug: string) => [
  { href: `/${orgSlug}/new-event`, title: 'Client job', body: 'A booked job for a client — proposals, ops, closeout.' },
  { href: `/${orgSlug}/new-market-day`, title: 'Market day', body: 'A single public selling day — farmers market, pop-up.' },
  { href: `/${orgSlug}/new-series`, title: 'Series', body: 'A repeating market — every week through a season.' },
]

export function NewOccasionChooser({
  orgSlug, storefrontEnabled, dropLabel,
}: {
  orgSlug: string
  storefrontEnabled: boolean
  dropLabel: string
}) {
  const doors = [
    ...DOORS(orgSlug),
    ...(storefrontEnabled
      ? [{ href: `/${orgSlug}/drops/new`, title: dropLabel, body: 'A pre-order window — customers order ahead online.' }]
      : []),
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {doors.map((d) => (
        <Link key={d.href} href={d.href} className="rounded-xl border bg-white p-5 hover:shadow-md transition-shadow">
          <p className="font-semibold">{d.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{d.body}</p>
        </Link>
      ))}
    </div>
  )
}
```

`app/(admin)/[orgSlug]/new/page.tsx`:

```tsx
export const dynamic = 'force-dynamic'

import { requireOrgMember } from '@/lib/auth/guards'
import { getIndustryPack, resolveEnabledModules, storefrontLabel } from '@/lib/industry-packs'
import { NewOccasionChooser } from '@/components/admin/occasions/NewOccasionChooser'

export default async function NewOccasionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { org } = await requireOrgMember(orgSlug)
  const pack = getIndustryPack(org.industry_pack_id)
  const modules = resolveEnabledModules(org.industry_pack_id)
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">What are you creating?</h1>
      <NewOccasionChooser
        orgSlug={orgSlug}
        storefrontEnabled={modules.includes('storefront')}
        dropLabel={storefrontLabel(pack)}
      />
    </div>
  )
}
```

`app/(admin)/[orgSlug]/new-market-day/page.tsx` (`'use client'`, `/new-event` pattern — orgId via `getOrgBySlug` effect):

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createMarketDay } from '@/actions/events'
import { getOrgBySlug } from '@/actions/orgs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function NewMarketDayPage() {
  const router = useRouter()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [orgId, setOrgId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [locationName, setLocationName] = useState('')
  const [address, setAddress] = useState('')
  const [start, setStart] = useState('08:00')
  const [end, setEnd] = useState('13:00')
  const [fee, setFee] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getOrgBySlug(orgSlug).then((org) => (org ? setOrgId(org.id) : setError('Organization not found')))
      .catch(() => setError('Failed to load organization'))
  }, [orgSlug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (!orgId) throw new Error('Organization not found')
      const event = await createMarketDay(orgId, {
        name, date,
        location: { name: locationName, ...(address.trim() ? { address } : {}) },
        ...(start && end ? { hours: { start, end } } : {}),
        ...(fee !== '' ? { booth_fee: Number(fee) } : {}),
      })
      router.push(`/${orgSlug}/${event.slug}/dashboard`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create market day')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-6">New market day</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="md-name">Name</Label>
              <Input id="md-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Boise Farmers Market" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-date">Date</Label>
              <Input id="md-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-loc">Location name</Label>
              <Input id="md-loc" value={locationName} onChange={(e) => setLocationName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-addr">Address (optional)</Label>
              <Input id="md-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="md-open">Opens</Label>
                <Input id="md-open" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="md-close">Closes</Label>
                <Input id="md-close" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="md-fee">Booth fee ($, optional)</Label>
              <Input id="md-fee" type="number" min="0" step="1" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating…' : 'Create market day'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

`app/(admin)/[orgSlug]/new-series/page.tsx` — same skeleton with: weekday `<select>` (Sun–Sat, default Saturday), `from`/`until` date inputs, the same location/hours/fee inputs, submitting:

```tsx
      const { series, created } = await createSeries(orgId, {
        name,
        location: { name: locationName, ...(address.trim() ? { address } : {}) },
        hours: { start, end },
        recurrence: { freq: 'weekly', weekday, from, until },
        ...(fee !== '' ? { booth_fee: Number(fee) } : {}),
      })
      router.push(`/${orgSlug}/series/${series.id}`)
```

with a helper line under the date inputs: `<p className="text-xs text-muted-foreground">Generates every matching day up front (max {SERIES_OCCURRENCE_CAP}) — skip any week later by archiving that day.</p>` (import the constant). Weekday select:

```tsx
            <div className="space-y-1">
              <Label htmlFor="s-weekday">Day of week</Label>
              <select id="s-weekday" className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
```

Config: `lib/sidebar-nav.ts` ORG_PAGE_SLUGS gains `'new', 'new-market-day', 'new-series', 'series'`; `SECTION_FOR_SLUG` in AdminSidebar gains the same four mapped to `'events'`.

- [ ] **Step 4: Run tests** — chooser test PASS; `npx next build` green (three new routes listed); full suite green.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/new" "app/(admin)/[orgSlug]/new-market-day" "app/(admin)/[orgSlug]/new-series" components/admin/occasions/NewOccasionChooser.tsx lib/sidebar-nav.ts components/layout/AdminSidebar.tsx __tests__/components/admin/occasions/NewOccasionChooser.test.tsx
git commit -m "feat(occasions): + New chooser and market-day/series create pages"
```

---

### Task 10: Series page

**Files:**
- Create: `app/(admin)/[orgSlug]/series/[seriesId]/page.tsx`, `components/admin/occasions/SeriesClient.tsx`
- Test: `__tests__/components/admin/occasions/SeriesClient.test.tsx`

**Interfaces:**
- Consumes: `getSeries`, `listSeriesDays`, `updateSeries`, `extendSeries`, `endSeries` (Task 5); `updateEvent` (day archive via existing action).
- Produces: `/{orgSlug}/series/[seriesId]` — header (name, cadence sentence, location, fee, Active/Ended), the season's day list (date, status, dashboard link, per-day **Skip** = `updateEvent(orgId, dayId, { status: 'archived' })` with confirm), **Edit** panel (name/location/hours/fee + "apply to remaining days" checkbox → `updateSeries(..., { propagate })`), **Extend** (date input → `extendSeries`), **End season** (confirm → `endSeries`).

- [ ] **Step 1: Write the failing test** — `__tests__/components/admin/occasions/SeriesClient.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const updateSeriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const extendSeriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ created: 2 }))
const endSeriesSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ archived: 1 }))
const updateEventSpy = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/actions/series', () => ({ updateSeries: updateSeriesSpy, extendSeries: extendSeriesSpy, endSeries: endSeriesSpy }))
vi.mock('@/actions/events', () => ({ updateEvent: updateEventSpy }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { SeriesClient } from '@/components/admin/occasions/SeriesClient'

const SERIES = {
  id: 's1', name: 'Boise Farmers Market', kind: 'market_day' as const,
  location: { name: 'Capitol Blvd' }, hours: { start: '08:00', end: '13:00' },
  recurrence: { freq: 'weekly' as const, weekday: 6, from: '2026-05-02', until: '2026-05-16' },
  booth_fee: 45, active: true, created_at: 'x',
}
const DAYS = [
  { id: 'd1', name: 'Boise Farmers Market', slug: 'bfm-1', year: 2026, status: 'active' as const, event_type_id: 'event', event_start: '2026-05-02', event_end: '2026-05-02', created_at: 'x', kind: 'market_day' as const, series_id: 's1' },
  { id: 'd2', name: 'Boise Farmers Market', slug: 'bfm-2', year: 2026, status: 'archived' as const, event_type_id: 'event', event_start: '2026-05-09', event_end: '2026-05-09', created_at: 'x', kind: 'market_day' as const, series_id: 's1' },
]

describe('SeriesClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the cadence, day rows with status, and links each day', () => {
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    expect(screen.getByText(/every saturday/i)).toBeInTheDocument()
    const row = screen.getByTestId('day-d2')
    expect(within(row).getByText(/skipped/i)).toBeInTheDocument()
    expect(within(screen.getByTestId('day-d1')).getByRole('link')).toHaveAttribute('href', '/acme/bfm-1/dashboard')
  })

  it('skips a day after confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    fireEvent.click(within(screen.getByTestId('day-d1')).getByRole('button', { name: /skip/i }))
    await waitFor(() => expect(updateEventSpy).toHaveBeenCalledWith('org-1', 'd1', { status: 'archived' }))
    confirmSpy.mockRestore()
  })

  it('saves edits with propagation when the checkbox is on', async () => {
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    fireEvent.click(screen.getByRole('button', { name: /edit series/i }))
    fireEvent.change(screen.getByLabelText(/booth fee/i), { target: { value: '55' } })
    fireEvent.click(screen.getByLabelText(/apply to remaining days/i))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateSeriesSpy).toHaveBeenCalledWith('org-1', 's1',
      expect.objectContaining({ booth_fee: 55 }), { propagate: true }))
  })

  it('extends and ends the season', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SeriesClient orgId="org-1" orgSlug="acme" series={SERIES} days={DAYS} isAdmin />)
    fireEvent.change(screen.getByLabelText(/extend through/i), { target: { value: '2026-06-27' } })
    fireEvent.click(screen.getByRole('button', { name: /extend/i }))
    await waitFor(() => expect(extendSeriesSpy).toHaveBeenCalledWith('org-1', 's1', '2026-06-27'))
    fireEvent.click(screen.getByRole('button', { name: /end season/i }))
    await waitFor(() => expect(endSeriesSpy).toHaveBeenCalledWith('org-1', 's1'))
    confirmSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** Page (`app/(admin)/[orgSlug]/series/[seriesId]/page.tsx`):

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { requireOrgMember } from '@/lib/auth/guards'
import { getSeries, listSeriesDays } from '@/actions/series'
import { SeriesClient } from '@/components/admin/occasions/SeriesClient'

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; seriesId: string }>
}) {
  const { orgSlug, seriesId } = await params
  const { orgId, member } = await requireOrgMember(orgSlug)
  const series = await getSeries(orgId, seriesId)
  if (!series) notFound()
  const days = await listSeriesDays(orgId, seriesId)
  return (
    <SeriesClient
      orgId={orgId}
      orgSlug={orgSlug}
      series={series}
      days={days}
      isAdmin={member.role === 'owner' || member.role === 'admin'}
    />
  )
}
```

`components/admin/occasions/SeriesClient.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSeries, extendSeries, endSeries } from '@/actions/series'
import { updateEvent } from '@/actions/events'
import type { Event, EventSeries } from '@/lib/types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SeriesClient({
  orgId, orgSlug, series, days: initialDays, isAdmin,
}: {
  orgId: string
  orgSlug: string
  series: EventSeries
  days: Event[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [days, setDays] = useState(initialDays)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(series.name)
  const [locationName, setLocationName] = useState(series.location.name)
  const [address, setAddress] = useState(series.location.address ?? '')
  const [start, setStart] = useState(series.hours.start)
  const [end, setEnd] = useState(series.hours.end)
  const [fee, setFee] = useState(series.booth_fee != null ? String(series.booth_fee) : '')
  const [propagate, setPropagate] = useState(false)
  const [extendUntil, setExtendUntil] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function handleSkip(day: Event) {
    if (!window.confirm(`Skip ${day.event_start}? The day is archived and stays skipped.`)) return
    await run(async () => {
      await updateEvent(orgId, day.id, { status: 'archived' })
      setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, status: 'archived' } : d)))
    })
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Series</p>
          <h1 className="text-2xl font-bold">{series.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every {WEEKDAYS[series.recurrence.weekday]} · {series.hours.start}–{series.hours.end} · {series.location.name}
            {series.booth_fee != null ? ` · $${series.booth_fee} booth` : ''} ·{' '}
            {series.active ? 'Active' : 'Ended'} through {series.recurrence.until}
          </p>
        </div>
        {isAdmin && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>Edit series</Button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive" aria-live="polite">{error}</p>}

      {editing && (
        <div className="mt-4 grid max-w-md gap-2 rounded-xl border bg-white p-4">
          <Label htmlFor="s-name">Name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="s-loc">Location name</Label>
          <Input id="s-loc" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          <Label htmlFor="s-addr">Address (optional)</Label>
          <Input id="s-addr" value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="s-start">Opens</Label>
              <Input id="s-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="s-end">Closes</Label>
              <Input id="s-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <Label htmlFor="s-fee">Booth fee ($)</Label>
          <Input id="s-fee" type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
            Apply to remaining days
          </label>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                run(() =>
                  updateSeries(orgId, series.id, {
                    name,
                    location: { name: locationName, ...(address.trim() ? { address } : {}) },
                    hours: { start, end },
                    booth_fee: fee !== '' ? Number(fee) : null,
                  }, { propagate })
                ).then(() => setEditing(false))
              }
            >
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-2">
        {days.map((d) => (
          <div key={d.id} data-testid={`day-${d.id}`} className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${d.status === 'archived' ? 'opacity-60' : ''}`}>
            <Link href={`/${orgSlug}/${d.slug}/dashboard`} className="min-w-0 flex-1">
              <span className="font-medium">{d.event_start}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {d.status === 'archived' ? 'Skipped' : d.status === 'active' ? 'On' : d.status}
              </span>
            </Link>
            {isAdmin && d.status !== 'archived' && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => handleSkip(d)}>Skip</Button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && series.active && (
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="s-extend">Extend through</Label>
            <Input id="s-extend" type="date" value={extendUntil} onChange={(e) => setExtendUntil(e.target.value)} />
          </div>
          <Button variant="outline" disabled={busy || !extendUntil} onClick={() => run(() => extendSeries(orgId, series.id, extendUntil))}>
            Extend
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End the season? Remaining future days will be archived.')) {
                run(() => endSeries(orgId, series.id))
              }
            }}
          >
            End season
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests** — SeriesClient suite PASS; `npx next build` green; full suite green.

- [ ] **Step 5: Commit**

```bash
git add "app/(admin)/[orgSlug]/series" components/admin/occasions/SeriesClient.tsx __tests__/components/admin/occasions/SeriesClient.test.tsx
git commit -m "feat(occasions): series page — season list, skip, edit+propagate, extend, end"
```

---

### Task 11: Nav rework — Events absorbs occasions + Drops; sidebar tags

**Files:**
- Modify: `components/layout/AdminSidebar.tsx`, `lib/sidebar-events.ts`
- Test: extend `__tests__/components/layout/AdminSidebar.test.tsx`, `__tests__/lib/sidebar-events.test.ts`

**Interfaces:**
- Consumes: `kindOf` (Task 1); the chooser route (Task 9); `storefrontLabel` prop (already threaded from the org layout).
- Produces: `SidebarEventRow` gains `kind: EventKind`; `selectUpcomingEvents` maps it via `kindOf`. In the Events section (no job open): occasion rows show a `Market` tag for market days beside the date tag; after the rows come **Drops** (storefront-gated, using `storefrontLabel ?? 'Online orders'`), **All events**, **+ New** (`/{orgSlug}/new`). `catalogChildren` LOSES its Drops entry; `SECTION_FOR_SLUG.drops` → `'events'` (done in Task 9's SECTION_FOR_SLUG edit — verify). Rail unchanged.

- [ ] **Step 1: Write the failing tests.** Extend `__tests__/lib/sidebar-events.test.ts`:

```ts
  it('carries the occasion kind through', () => {
    const rows = selectUpcomingEvents([
      { ...baseEvent, id: 'm1', kind: 'market_day', event_start: '2026-08-20' },
      { ...baseEvent, id: 'c1', event_start: '2026-08-21' },
    ] as never, '2026-08-16')
    expect(rows[0].kind).toBe('market_day')
    expect(rows[1].kind).toBe('client_job')
  })
```

(Use the file's existing event fixture shape as `baseEvent`.) Extend the AdminSidebar suite:

```tsx
  it('tags market-day rows and moves Drops under Events', () => {
    const events = [
      { id: 'm1', name: 'Boise Farmers Market', slug: 'bfm', label: 'Aug 22', isToday: false, kind: 'market_day' as const },
      { id: 'c1', name: 'Hendricks wedding', slug: 'hendricks', label: 'Aug 23', isToday: false, kind: 'client_job' as const },
    ]
    render(<AdminSidebar orgSlug="acme" upcomingEvents={events} enabledModules={['events', 'storefront'] as ModuleId[]} storefrontLabel="Drops" />)
    fireEvent.click(screen.getByRole('button', { name: /expand events/i }))
    const marketRow = screen.getByRole('link', { name: /Boise Farmers Market/ })
    expect(within(marketRow).getByText('Market')).toBeInTheDocument()
    const clientRow = screen.getByRole('link', { name: /Hendricks wedding/ })
    expect(within(clientRow).queryByText('Market')).not.toBeInTheDocument()
    // Drops lives under Events now…
    expect(screen.getByRole('link', { name: 'Drops' })).toHaveAttribute('href', '/acme/drops')
    // …and + New points at the chooser
    expect(screen.getByRole('link', { name: '+ New' })).toHaveAttribute('href', '/acme/new')
  })

  it('keeps Drops out of Catalog', () => {
    render(<AdminSidebar orgSlug="acme" enabledModules={['events', 'storefront', 'catalog'] as ModuleId[]} storefrontLabel="Drops" catalogLabel="Menu Packages" />)
    fireEvent.click(screen.getByRole('button', { name: /expand catalog/i }))
    // Menu Packages renders; Drops does not appear among Catalog children.
    expect(screen.getByRole('link', { name: 'Menu Packages' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Drops' })).not.toBeInTheDocument()
  })
```

(Second test renders without expanding Events, so the Drops-under-Events row is absent — the only possible `Drops` link would be Catalog's, which must not exist.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `lib/sidebar-events.ts`: add `kind` to `SidebarEventRow`, import `kindOf`:

```ts
import { kindOf } from '@/lib/occasions/kind'
import type { Event, EventKind } from '@/lib/types'

export interface SidebarEventRow {
  id: string
  name: string
  slug: string
  label: string      // 'Today' when the event starts today, else 'Aug 20'
  isToday: boolean
  kind: EventKind
}
```

and in the map: `return { id: e.id, name: e.name, slug: e.slug, label: …, isToday, kind: kindOf(e) }`.

**Fixture ripple:** `kind` is REQUIRED on `SidebarEventRow`, so every existing test fixture building rows by hand needs `kind: 'client_job' as const` added — the `events` array in `__tests__/components/layout/AdminSidebar.test.tsx` (~lines 165-168) and any row fixtures in `__tests__/actions/sidebar-events.test.ts`. tsc will name them; fix each by adding the field.

`AdminSidebar.tsx` Events-section children (no-eventSlug branch) becomes:

```tsx
                <>
                  {(upcomingEvents ?? []).map((e) => (
                    <Link
                      key={e.id}
                      href={`/${orgSlug}/${e.slug}/dashboard`}
                      className="flex items-center gap-2 pl-[26px] pr-3 py-2 rounded-md text-sm text-[color:var(--sidebar-muted)] hover:bg-[color:var(--sidebar-accent)] hover:text-[color:var(--sidebar-accent-foreground)]"
                    >
                      <span className="truncate flex-1">{e.name}</span>
                      {e.kind === 'market_day' && (
                        <span className="text-[9px] uppercase tracking-wide rounded bg-[color:var(--sidebar-accent)] px-1 shrink-0">Market</span>
                      )}
                      <span className={`text-[10px] shrink-0 ${e.isToday ? 'font-semibold' : ''}`}>{e.label}</span>
                    </Link>
                  ))}
                  {has('storefront' as ModuleId) && (
                    <NavItem
                      href={`/${orgSlug}/drops`}
                      label={storefrontLabel ?? 'Online orders'}
                      icon="packages"
                      active={isActive(pathname, `/${orgSlug}/drops`)}
                      indent
                    />
                  )}
                  <NavItem href={`/${orgSlug}`} label="All events" icon="events" active={allEventsActive} indent />
                  <NavItem
                    href={`/${orgSlug}/new`}
                    label="+ New"
                    icon="events"
                    active={isActive(pathname, `/${orgSlug}/new`) && !isActive(pathname, `/${orgSlug}/new-event`)}
                    indent
                  />
                </>
```

Remove the Drops entry from `catalogChildren` (delete its line). Update `newEventActive` derivation: `const newEventActive = isActive(pathname, '/${orgSlug}/new')` covers `/new`, `/new-event`, `/new-market-day`, `/new-series` by prefix — keep `eventsActive` fed by it. Verify `SECTION_FOR_SLUG.drops` is `'events'` (Task 9) and remains in `ORG_PAGE_SLUGS`.

- [ ] **Step 4: Run tests** — both extended suites + full suite green; `npx next build` green.

- [ ] **Step 5: Commit**

```bash
git add components/layout/AdminSidebar.tsx lib/sidebar-events.ts __tests__/components/layout/AdminSidebar.test.tsx __tests__/lib/sidebar-events.test.ts
git commit -m "feat(occasions): Events section absorbs occasions + Drops; market tags; + New chooser row"
```

---

### Task 12: All-events grouping, calendar detail, verification, roadmap

**Files:**
- Modify: `app/(admin)/[orgSlug]/page.tsx`, `lib/calendar.ts`, `docs/ROADMAP.md`
- Test: extend `__tests__/lib/calendar.test.ts`

**Interfaces:**
- Consumes: `kindOf`, `EVENT_KIND_LABELS` (Task 1); `listSeries` (Task 5).
- Produces: the all-events page renders two groups — **Client jobs** and **Market days** (market days grouped by series with a link to each series page; days without a series listed flat); each card keeps its badges plus a kind badge. `lib/calendar.ts` event block: market days get `detail: location.name` when no headcount (client jobs keep the guests detail).

- [ ] **Step 1: Write the failing test** — extend `__tests__/lib/calendar.test.ts` (fixtures already carry `drops: []`):

```ts
  it('market-day events carry their location as the detail line', () => {
    const items = buildCalendarFeed('acme', {
      ...EMPTY_SOURCES,
      events: [{
        ...baseEvent, id: 'm1', slug: 'bfm', name: 'Boise Farmers Market',
        kind: 'market_day', location: { name: 'Capitol Blvd' }, event_start: '2026-08-22', event_end: '2026-08-22',
      }],
    } as never)
    const row = items.find((i) => i.id === 'm1')!
    expect(row.kind).toBe('event')
    expect(row.detail).toBe('Capitol Blvd')
  })
```

(Adapt `EMPTY_SOURCES`/`baseEvent` to the file's fixtures.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** `lib/calendar.ts` event block — replace the `detail` line:

```ts
      detail: e.headcount
        ? `${e.headcount} guests`
        : (e.kind ?? 'client_job') === 'market_day' && e.location
          ? e.location.name
          : undefined,
```

(Direct `e.kind ?? 'client_job'` here rather than importing kindOf keeps lib/calendar dependency-light — the ONE sanctioned exception, marked with a comment: `// inline kindOf: lib/calendar stays dependency-light`. If the reviewer prefers the import, either is acceptable.)

`app/(admin)/[orgSlug]/page.tsx`: fetch `listSeries(org.id)` in the existing `Promise.all`; partition `events` with `kindOf`; render:

```tsx
      {clientJobs.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Client jobs</h2>
          {/* existing department grouping applies to client jobs only — reuse the current blocks with `clientJobs` in place of `events` */}
        </section>
      )}
      {marketDays.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Market days</h2>
          {seriesList.map((s) => {
            const seriesDays = marketDays.filter((e) => e.series_id === s.id)
            if (seriesDays.length === 0) return null
            return (
              <div key={s.id} className="mb-6">
                <Link href={`/${orgSlug}/series/${s.id}`} className="text-sm font-medium underline">{s.name}</Link>
                <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{seriesDays.map(renderCard)}</div>
              </div>
            )
          })}
          {(() => {
            const standalone = marketDays.filter((e) => !e.series_id)
            if (standalone.length === 0) return null
            return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{standalone.map(renderCard)}</div>
          })()}
        </section>
      )}
```

with `renderCard` gaining one badge: `<Badge variant="outline">{EVENT_KIND_LABELS[kindOf(event)]}</Badge>`. Keep the existing empty-state and "New event" header button (retarget its href to `/{orgSlug}/new`).

- [ ] **Step 4: Full verification battery**

Run, all green: `npx vitest run` (full) · `npx tsc --noEmit -p tsconfig.json` (baseline 2 only) · `npx next build` · `npm run lint 2>&1 | grep -E "occasions|series|new-market|AdminSidebar"` (no NEW errors in touched files).

- [ ] **Step 5: Roadmap.** Add under `## In flight` in `docs/ROADMAP.md`: an **Occasions core** entry (market days as Event kinds, up-front series, Events-section nav rework, R1 registration slimming; spec `superpowers/specs/2026-08-15-selling-occasions-pos-design.md`; next increments: counter register → tabs/public → registration retirement R2).

- [ ] **Step 6: Commit**

```bash
git add "app/(admin)/[orgSlug]/page.tsx" lib/calendar.ts __tests__/lib/calendar.test.ts docs/ROADMAP.md
git commit -m "feat(occasions): all-events kind grouping + calendar market-day detail; roadmap"
```

---

## Execution notes

- Worktree isolation via superpowers:using-git-worktrees; branch `occasions-core` from **origin/main** (fetch first — main moves often in this repo; the primary checkout's local main may be diverged, branch from origin). Fresh worktrees need `npm install` + a copied `.env.local` for `next build`. Implementer subagents must verify cwd + branch before committing.
- Tasks 1→5 are strictly ordered. 6 depends on 5; 7–8 on 1/3; 9 on 5 (+2 for the cap constant); 10 on 5+9 (route registration); 11 on 1+9; 12 on 1+5+11. Within constraints, 6–8 can interleave after 5.
- The AdminSidebar is the busiest merge surface in this repo (three PRs touched it this week) — Tasks 8/9/11 all edit it; execute them in order and keep diffs surgical.
- Do not push without `gh auth switch` to the Lifewithmo account (memory).




