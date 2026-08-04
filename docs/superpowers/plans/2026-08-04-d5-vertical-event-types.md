# D5 — Replace Built-in Church Event-Types with Vertical Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Single atomic task (one implementer + one review) — the terminology change breaks every test asserting the old labels, so it must land green in one commit.

**Goal:** Replace the five church event-types (`summer-camp`/`retreat`/`vbs`/`gala`/`mission-trip`) with neutral vertical types aligned to the industry packs, and make the default neutral — finishing the neutralization program.

**Architecture:** Rewrite `BUILT_IN_EVENT_TYPES` + `EventTypeId` + `DEFAULT_EVENT_TYPE_ID` in `lib/event-types.ts`; re-point the industry packs' `eventTypeId`s to the new ids; update every test whose assertion depends on the old terminology/default. No schema change — `Camp`/`Event`... err, `Event.event_type_id` is a `string`, so stored ids remain valid strings (unknown ids fall back to the default).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Pre-launch: no data migration; unknown stored `event_type_id`s fall back to `DEFAULT_EVENT_TYPE_ID` via `getEventType`.
- Green gate: `npx tsc --noEmit` clean AND `npm test` passes (450 tests). Because changing default terminology breaks runtime assertions (not tsc), you MUST run the full suite and fix every fallout in THIS task.
- Do not rename code entities or touch display copy outside `lib/event-types.ts` / packs / tests.
- Work only in `/Users/rm/vw/traxevent/.claude/worktrees/d5-event-types` on branch `claude/d5-event-types`; confirm the branch before committing. (node_modules may need `npm install` to sync `server-only` — run it if the suite shows 5-6 `server-only` load failures.)

---

### Task 1: Replace event-types + re-point packs + fix test fallout

**Files:**
- Modify: `lib/event-types.ts` (the union, the 5 built-ins, the default)
- Modify: `lib/industry-packs.ts` (each pack's `eventTypeId`)
- Modify: the test files that assert old terminology/ids (discover via the suite; the direct ones are `__tests__/lib/event-types.test.ts` and `__tests__/lib/resolve-terminology.test.ts`)

**Interfaces:**
- Produces: `EventTypeId = 'event' | 'catering' | 'photo-shoot' | 'floral-event' | 'coffee-service'`; `DEFAULT_EVENT_TYPE_ID = 'event'`; `getEventType`/`getAllEventTypes`/`resolveTerminology` signatures unchanged.

- [ ] **Step 1: Rewrite the built-ins in `lib/event-types.ts`**

Replace the `EventTypeId` type, the `DEFAULT_EVENT_TYPE_ID`, and the entire `BUILT_IN_EVENT_TYPES` array with:

```typescript
export type EventTypeId = 'event' | 'catering' | 'photo-shoot' | 'floral-event' | 'coffee-service'

export const DEFAULT_EVENT_TYPE_ID: EventTypeId = 'event'

const BUILT_IN_EVENT_TYPES: EventType[] = [
  {
    id: 'event',
    name: 'General Event',
    description: 'A booked event with customers and guests',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Customer', registrantPlural: 'Customers',
      memberSingular: 'Guest', memberPlural: 'Guests',
      assignmentSingular: 'Assignment', assignmentPlural: 'Assignments',
      eventLabel: 'Event',
    },
  },
  {
    id: 'catering',
    name: 'Catering',
    description: 'Event catering with menu, headcount, and stations',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Guest', memberPlural: 'Guests',
      assignmentSingular: 'Station', assignmentPlural: 'Stations',
      eventLabel: 'Event',
    },
  },
  {
    id: 'photo-shoot',
    name: 'Photography',
    description: 'Photo/video sessions with clients and subjects',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Subject', memberPlural: 'Subjects',
      assignmentSingular: 'Session', assignmentPlural: 'Sessions',
      eventLabel: 'Shoot',
    },
  },
  {
    id: 'floral-event',
    name: 'Floral & Event Design',
    description: 'Floral design and installation for events',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Recipient', memberPlural: 'Recipients',
      assignmentSingular: 'Delivery', assignmentPlural: 'Deliveries',
      eventLabel: 'Event',
    },
  },
  {
    id: 'coffee-service',
    name: 'Mobile Beverage',
    description: 'Mobile coffee/beverage service for events',
    registrationUnit: 'individual',
    terminology: {
      registrantSingular: 'Client', registrantPlural: 'Clients',
      memberSingular: 'Guest', memberPlural: 'Guests',
      assignmentSingular: 'Station', assignmentPlural: 'Stations',
      eventLabel: 'Service',
    },
  },
]
```

Leave `getEventType`, `getAllEventTypes`, `resolveTerminology`, and the `Terminology`/`EventType` interfaces unchanged.

- [ ] **Step 2: Re-point the industry packs**

In `lib/industry-packs.ts`, update each pack's `eventTypeId`:
- `general` → `'event'`
- `coffee-cart` → `'coffee-service'`
- `caterer` → `'catering'`
- `florist` → `'floral-event'`
- `photographer` → `'photo-shoot'`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Any `EventTypeId` mismatch surfaces here — e.g. a pack still naming `'gala'`.)

- [ ] **Step 4: Rewrite the two direct event-type tests**

Update `__tests__/lib/event-types.test.ts` and `__tests__/lib/resolve-terminology.test.ts` so they assert the NEW types/terminology (e.g. `getEventType('event').terminology.memberSingular === 'Guest'`; `getAllEventTypes()` returns the 5 new ids; unknown id falls back to `'event'`). Preserve the tests' intent — same behaviors, new expected values.

- [ ] **Step 5: Run the full suite and fix every fallout**

Run: `npm test`
Every failure will be a test asserting an OLD church string or the old default. Fix each by updating the expectation to the new neutral value:
- `'Families'` → `'Guests'` (default `memberPlural`; note `registrantPlural` default is now `'Customers'` — pick the one the assertion is actually about)
- `'Camper'`/`'Campers'` → `'Guest'`/`'Guests'`
- `event_type_id: 'summer-camp'` fixtures → `'event'` (or leave the id and only fix terminology assertions — unknown ids still resolve to `'event'`, so either works; prefer changing the fixture id to `'event'` for clarity)
- any assertion on `'Camp'`/`eventLabel` → `'Event'`
Re-run until green. Do NOT change production code to satisfy a test — the terminology is the intended new behavior; the tests are what move.

- [ ] **Step 6: Verify no church event-type ids remain**

Run: `grep -rnE "summer-camp|'vbs'|'retreat'|'mission-trip'|'gala'" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: zero (outside historical docs). Report anything left.

- [ ] **Step 7: Final typecheck + full suite**

Run: `npx tsc --noEmit` (clean), then `npm test` (450 pass, no new failures).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(d5): replace church event-types with neutral vertical types + default"
```

## Self-Review

**Spec coverage:** new vertical types + neutral default (Step 1), packs re-pointed (Step 2), church terminology removed from the skin (Step 1 replaces `Camper`/`Family` defaults), tests migrated (Steps 4-5), no church ids left (Step 6). This completes the neutralization program.

**Placeholder scan:** Step 1-2 give exact code; Steps 4-5 are a concrete suite-driven fallout fix (the failing tests enumerate themselves) with an explicit old→new mapping, not a vague "fix tests."

**Consistency:** the 5 new `EventTypeId`s in Step 1 are exactly the 5 referenced by the packs in Step 2; `DEFAULT_EVENT_TYPE_ID` is `'event'`, one of the union members.
