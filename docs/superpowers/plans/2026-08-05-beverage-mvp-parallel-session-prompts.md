# Beverage MVP screens — parallel session split (2026-08-05)

Four streams, zero file overlap between them:

| Stream | Tasks | Session |
|---|---|---|
| Ops-tab lists | Task 8 (deadlines + shopping/packing lists + print view) | existing session (worktree `beverage-mvp-screens-plan-dbab6c`) |
| Evidence + issues | Tasks 9–10 (photo evidence upload, runnable checklists, issues card) | **new session A** |
| Compliance | Tasks 11–12 (backend ✅ done, screen + ops-tab warnings in progress) | this session (worktree `beverage-mvp-parallel-work-3e95d1`) |
| Closeout | Tasks 13–14 (closeout screen + final invoice) | **new session B** |

Task 15 (full verification) runs ONCE at the end, after all branches merge.

---

## Message for the EXISTING session (beverage-mvp-screens-plan-dbab6c)

Paste this into that session so it doesn't collide with the others:

> Scope change: only implement Task 8 (deadlines + lists + print view) from the plan, then STOP and push your branch. Tasks 9–10, 11–12, and 13–14 are being built in parallel sessions on separate branches. Do not start Task 9.

---

## Prompt for NEW SESSION A — Tasks 9–10 (photo evidence + checklists + issues)

> Create a new git worktree with a new branch based off the branch `claude/beverage-mvp-screens-plan-dbab6c` (it has plan Tasks 1–7 committed). Then: copy `.env.local` from the primary checkout at `/Users/rm/vw/traxevent/.env.local` into the worktree (it's gitignored and required for `npm run build`), and run `npm install` inside the worktree. Never run tests or builds from the primary checkout — only from inside your worktree.
>
> Read `docs/superpowers/plans/2026-08-05-beverage-mvp-screens.md` (in your worktree): the Global Constraints section, then implement ONLY **Task 9 (photo evidence upload + runnable checklists)** and **Task 10 (issues card)**, exactly as written, using superpowers:executing-plans — TDD steps in order, `npm run build` before calling any task green, one commit per task with the plan's commit messages.
>
> This is a parallel workstream: other sessions own Tasks 8 (DeadlinesCard/ListsCard/print), 11–12 (compliance), and 13–14 (closeout). Touch ONLY the files listed in Tasks 9 and 10 (`lib/firebase-admin.ts`, `actions/ops-evidence.ts`, `next.config.ts`, `components/admin/ops/ChecklistsCard.tsx`, `components/admin/ops/IssuesCard.tsx`, plus their tests). When both tasks are done and green, push your branch and stop — do NOT start any other task or run Task 15.

## Prompt for NEW SESSION B — Tasks 13–14 (closeout + final invoice)

> Create a new git worktree with a new branch based off the branch `claude/beverage-mvp-screens-plan-dbab6c` (it has plan Tasks 1–7 committed). Then: copy `.env.local` from the primary checkout at `/Users/rm/vw/traxevent/.env.local` into the worktree (it's gitignored and required for `npm run build`), and run `npm install` inside the worktree. Never run tests or builds from the primary checkout — only from inside your worktree.
>
> Read `docs/superpowers/plans/2026-08-05-beverage-mvp-screens.md` (in your worktree): the Global Constraints section, then implement ONLY **Task 13 (closeout screen)** and **Task 14 (generate final invoice from closeout)**, exactly as written, using superpowers:executing-plans — TDD steps in order, `npm run build` before calling any task green, one commit per task with the plan's commit messages.
>
> This is a parallel workstream: other sessions own Tasks 8, 9–10, and 11–12. Touch ONLY the files listed in Tasks 13 and 14 (`app/(admin)/[orgSlug]/[eventSlug]/ops/closeout/page.tsx`, `components/admin/ops/CloseoutClient.tsx`, `actions/invoices.ts`, plus their tests). When both tasks are done and green, push your branch and stop — do NOT start any other task or run Task 15.

---

## Merge plan (after all four streams finish)

All branches share history through commit `2d6ca68`+ (Tasks 1–7), so merges should be clean — no two streams touch the same file. The one seam: this session (Task 12) adds the `complianceWarnings` wiring to `app/(admin)/[orgSlug]/[eventSlug]/ops/page.tsx`, which Task 8's session does not modify.

1. Merge all four branches into one (any order).
2. Run Task 15 there: `npm run test`, `npm run build`, then the manual spec walk.
3. PR to `main`.
