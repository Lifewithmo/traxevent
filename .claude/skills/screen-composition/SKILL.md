---
name: screen-composition
description: Use when building or redesigning any TraxEvent admin/operator screen, page, panel, or multi-field view — before writing JSX. Prevents schema-order block stacks. Triggers on "build the X page", "redesign X", "add a section to X", any spec in docs/superpowers/specs/ that produces UI, and any review of a screen that "looks generic" or "doesn't flow".
---

# Screen composition

Most agent-written UI fails the same way: the page mirrors the data model. Each
field group becomes a bordered card, cards get equal visual weight, they stack
vertically in type-definition order. The result is technically complete and
useless — no focal point, nothing adapts to state, and reading order matches the
database instead of the decision the operator came to make.

This skill exists to stop that. It is about **composition and flow**, not tokens.
For colors and tokens see `docs/design-system.md` and the Repo constraints
section below.

## The method

Work these four steps **before writing any JSX**. Write steps 1–3 into the spec
or the PR description — they are reviewable claims, not private reasoning.

### 1. Name the job

One sentence, in the operator's words, not the schema's. Not "display the
invoice entity" — "figure out whether this invoice is safe to send, and send it."

If you cannot write this sentence, you do not understand the screen yet. Stop and
ask. Do not start from the type definition.

### 2. Name the decision and the deciding number

What does the operator *do* after looking at this screen, and what one value
drives it? On an invoice: the balance due. On the pipeline: what's booked vs.
what needs chasing.

That value is the focal element. It gets size, weight, and position — and
everything else on the screen gets quieter so it can be seen. If three things
are shouting, nothing is.

### 3. Order by decision, not by schema

List the screen's content in the order the operator needs it to decide. This
order is almost never the order the fields appear in the type. Supporting detail
that is rarely needed goes behind progressive disclosure, not into another card.

### 4. Only now choose containers

Ask of every box: what would break if this border were deleted? If the answer is
"nothing", delete it. A border is the laziest available grouping device and
usually the wrong one — whitespace, a rule, alignment, or a weight change groups
just as clearly and adds no visual noise.

## Hard rules

These are testable. A reviewer can check each one against the diff.

1. **No uniform card stacks.** Three or more sibling `<Card>` elements of equal
   weight in a vertical `space-y-*` column is a defect, not a layout. Fix by
   deleting boxes, not by restyling them.
2. **One focal element per screen.** It is visually dominant — larger type,
   heavier weight, or isolated by space. If every heading is `text-base
   font-semibold`, there is no hierarchy.
3. **Never render the same value three times.** If a number appears in more than
   one place, the screen has not decided what it is about.
4. **Every number carries its interpretation.** A figure with no comparison,
   trend, or "so what" line is decoration. `$4,200` means nothing; `$4,200 · up
   12% vs this month last year` is a decision input. See `yoyLine()` in
   `components/admin/pipeline/PipelineStatsHeader.tsx`.
5. **Primary action sits with the thing it acts on**, not in a flat row of
   equal-weight buttons. Secondary and destructive actions are visually
   subordinate or behind a menu — never peers of the primary.
6. **Use the width available.** A fixed `max-w-2xl` on a data-dense operator
   screen wastes half the viewport. Constrain reading columns; do not constrain
   working surfaces.
7. **Grids degrade explicitly.** State the breakpoint behavior
   (`max-[1000px]:grid-cols-2`). "It's flex so it'll be fine" is not a
   responsive design.

## State adaptivity

Empty, one, many, and error are **four designs, not one**. A screen that only
looks right with three rows of seed data is unfinished. Before the screen is
done, each of these must be answered explicitly:

| State | Requirement |
|---|---|
| Empty | Says what this is and offers the action that creates the first one. Never a bare "No items." |
| One | Does not look broken or lonely — no orphaned column headers over a single row. |
| Many | Degrades: scroll, paginate, or summarize. Decide which. |
| Insufficient data | Derived values that need history must have a fallback. See `yoyLine()` returning `null` when last year has no data. |
| Loading | Skeletons matching final layout, not spinners. |
| Error / locked | Read-only and permission-denied states are designed, not just `disabled`. |

Singular/plural, zero, and very large numbers are part of this, not polish.

## Repo constraints

- **The palette is re-graded.** `app/globals.css` remaps stock Tailwind palettes
  onto the warm system: `gray→warm`, `purple→copper`, `emerald→moss`,
  `red→terracotta`, `amber/yellow→honey`, `blue→copper`. So `text-blue-600`
  renders copper. Use utility classes and they inherit the system.
- **Never write a raw hex literal.** The re-grade does not catch inline hex —
  that is why 16 files in the registrant zone still render the pre-redesign
  purple. Use tokens or re-graded utilities.
- **Prefer semantic tokens** (`var(--sidebar-accent)`, `var(--muted-foreground)`)
  over stock scale classes when the role is semantic.
- `docs/design-system.md` is **stale** — it documents a blue/Plus Jakarta system
  that no longer ships. `app/globals.css` is the source of truth for tokens.

## Calibration: two screens in this repo

Read both before composing anything non-trivial.

**Good — `components/admin/pipeline/PipelineStatsHeader.tsx`**
Zero cards; rules and hairline dividers group instead. Each KPI is label →
value → interpretation. Adapts on three axes (no prior-year data, empty months,
singular/plural). Progressive disclosure on the backlog chart, with the collapsed
state showing a summary rather than nothing. Grid degrades 4→2→1 at stated
breakpoints.

**Bad — `components/admin/InvoiceEditorClient.tsx`**
`max-w-2xl space-y-6` wrapping six equal-weight cards in Firestore field order:
Details → Line items → Discount & tax → Breakdown → buttons → Client link →
Payments. Balance due — the reason the operator opened the page — is `text-sm
font-semibold`, the same weight as the word "Subtotal". Money is rendered in
three separate cards. Six sibling buttons of near-equal weight, including
`Delete`, sit mid-page. Half the viewport is unused.

The difference between these two files is not styling. It is that one was
composed from the operator's task and the other from the data model.

## Review checklist

Before calling a screen done:

- [ ] The job sentence is written down and the screen serves it
- [ ] One focal element, and it is the deciding value
- [ ] Every box justified — or deleted
- [ ] No value rendered twice
- [ ] Every number has its "so what"
- [ ] Primary action is visually primary; destructive is not its peer
- [ ] Empty / one / many / loading / error all specified
- [ ] Breakpoint behavior stated explicitly
- [ ] No raw hex; tokens or re-graded utilities only
- [ ] Read it top to bottom — does the order match how the operator thinks?
