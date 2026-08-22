# Verified categorical ramp for calendar kind colours

Salvaged from a spend-limit-killed agent and **independently re-run by the orchestrator**
(`node .superpowers/sdd/cal-ambition/palette-check.mjs`). Numbers below are reproduced output,
not claims.

## The defect (CIE Lab ΔE)
- `event`/`lead` = **ΔE 0.0 in BOTH themes** — `--primary` and `--link` are literally the same value.
  A booked job and a tentative hold are one swatch. Highest-stakes pair on the screen.
- `drop`/`follow_up` = 10.2 light / **4.6 dark** — a SECOND collision the original audit missed.

## The ramp (all pairs >= ΔE 25.2 light / 35.8 dark; all >= 3:1 on #ffffff/#f7f8fa and #1d1d1c/#131313)
| kind | light | dark |
|---|---|---|
| event        | #1450a3 | #5ca8e8 |
| lead         | #7b3fb0 | #c093ee |
| drop         | #146b3d | #4fc07e |
| invoice_due  | #8a5000 | #f0b93d |
| follow_up    | #00767c | #4fd0d8 |
| task         | #5e6672 | #a6a9a3 |
| compliance   | #c4362a | #f0705c |

Namespaced as `--cal-kind-*` in BOTH blocks of app/globals.css — deliberately NOT reusing semantic
roles, because the semantic palette is a two-hue system and cannot yield seven separable categories.

## Shape channel (the non-colour channel, WCAG 1.4.1)
Grammar: **SHAPE = family, FILL = commitment.**
event=square (solid: booked) · lead=square-hollow (same family, not filled in yet) ·
drop=diamond · invoice_due=triangle · follow_up=circle · task=bar · compliance=cross

## Still TODO (the killed agent did NOT do these — applying kind-color.ts alone BREAKS the app)
1. Add the `--cal-kind-*` tokens to both blocks of app/globals.css.
2. Build the `KindDot` component wiring colour + shape + sr-only label.
3. Add the pairwise-ΔE test that resolves vars back to hex from globals.css and fails under ΔE 20.
