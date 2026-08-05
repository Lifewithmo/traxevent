# Invoice Module — Recorded Enhancements (backlog)

Future work captured during design, deferred deliberately. Each needs its own
brainstorm → design → spec → plan before building.

## ENH-1: Per-portion taxation for deposit/progress invoices  (option #3)

**Status:** to brainstorm + map.
**Context:** The invoice discount/tax/itemization slice (option #2,
[design](../superpowers/specs/2026-08-05-invoice-discount-tax-itemization-design.md))
prices deposit/progress invoices as single portion lines off the accepted
(already-taxed) total, and represents the final as full itemized scope minus a
credit line. It does **not** compute tax on each portion independently.

**The enhancement:** let each deposit/progress/final invoice carry tax on its own
slice (remit tax as you bill), as some jurisdictions/accounting policies require.

**Open questions to work through when picked up:**
- What is the taxable base of a deposit that is a % of an already-taxed total?
  (Gross-up vs. tax-on-portion vs. tax-deferred-to-final.)
- How does per-portion tax reconcile with the accepted total so cumulative billed
  still equals the approved scope (no over/under-collection of tax)?
- Interaction with the credit-on-final mechanic (avoid double-taxing or
  double-crediting the deposit's tax).
- QBO tax-code mapping per portion when sync lands.
- Honoring per-line `taxable` in the tax base (currently stored, not honored —
  mirrors the proposal model; should change in both together).

**Dependencies:** builds on option #2 (invoice-level discount/tax + credits) and
should be revisited alongside the QBO sync slice.
