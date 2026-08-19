# Events module — design-ambition anchor (Phase 1: jobs, roles, cardinality)

> Input frame for the research/panel fleet. The as-shipped module (#95) is honestly located
> at **"good" (kit parity + structural spine)** — gate 2 (genuine idea) unmet, gate 3
> (walked as the real user) unmet. This redo exists to reach great/category-defining.

## Named roles (split, not averaged)

**Mo — solo operator-owner (BrewTrax vertical, mobile beverage).** Wins jobs in Pipeline;
Events is where booked work gets *delivered*: weddings/corporate jobs + weekly market days.
Half the usage is from a phone, standing in a prep kitchen or a field. The incumbent being
displaced is a legal pad + a HoneyBook tab + a Square report.

**Casey — program/ops coordinator (roster-enabled orgs: camps/programs).** Manages
registrant families, slot assignments, day-of check-in (child-safety custody records),
volunteers, forms compliance. Day-of usage is a phone/tablet at a folding table with a line.

## Jobs-to-be-done per surface

| Surface | Job (one sentence) | Cardinality |
|---|---|---|
| Org events home | "Show me which booked work needs me next, and whether anything is at risk." | n:many (seasonal, unbounded) |
| Event dashboard | "Am I ready for THIS job and what's my next move?" — **as-shipped: an EmptyState stub for client jobs. The flagship gap.** | n:1 entity, many facts |
| Ops plan | "Decide and prep what to bring and do for this job." | n:few lists → many items |
| Closeout | "Record actuals, see the real margin, get paid." | wizard |
| Families/assignments/check-in | "Get everyone registered, assigned, and checked in without a clipboard." | n:many registrants |
| Itinerary/communicate/forms | "Tell people what's happening; collect what's required." | n:few→many |
| Market-day overview | "Is this day staffed, stocked, and worth it?" | n:many days in a series |

## Highest-frequency flow (interaction-budget subject)

**T-1 evening / day-of morning:** open tomorrow's job → know if I'm ready → see exactly
what to load → go. Second: Casey's check-in loop (find family → check in → next) under line
pressure. Both get numeric step budgets, as-shipped vs proposed.

## Displacement audit targets (by name)

HoneyBook (locked anti-position; weak delivery half), Jobber / Housecall Pro / ServiceTitan /
Zuper (field-service day-of bar), Curate (catering ops: the closest vertical — recipe→pack
lists), Goodshuffle Pro (event rentals pull sheets), Tripleseat / Perfect Venue / Event
Temple (venue BEOs), Square (market-day sales reality), and paper/spreadsheets (the real
incumbent).

## Category-defining seed candidates (hypotheses — to be adversarially verified against code)

1. **Job Day run sheet** — phone-first day-of execution surface per event (timeline, load
   list, contacts, venue nav, glove-sized targets, offline-tolerant).
2. **Computed load-out list** — what-to-pack with quantities derived from packages ×
   headcount (lib/ops/derive + units core), check-off, "short" flagging. Compute→action.
3. **Readiness horizon** — T-minus-ranked cross-event not-ready radar on the org home.
4. **Live margin closeout** — planned-vs-actual deltas as you type.
5. **Season performance strip** — market-day series: per-day actuals vs booth fee.

Candidates live or die on (a) a real data seam existing today, (b) beating the named
market bar, (c) tracing to canon. None is pre-chosen.
