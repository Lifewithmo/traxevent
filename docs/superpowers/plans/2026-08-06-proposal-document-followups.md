# Proposal Document (Increment 1) — Carried-Forward Items

Recorded at the close of the increment so nothing is lost when the execution ledger goes away.
None of these blocked merge. Grouped by whether they are a decision, a defect, or a gap.

## Not done — the one unsatisfied plan step

**The manual end-to-end walk against the Firebase emulators was never run.** It is Step 4 of
Task 10 in the plan, and it is not runnable on this branch: there is no emulator wiring in
`lib/firebase.ts` / `lib/firebase-admin.ts`, no `emulators` or `dev:emulator` script, and no
emulators block in `firebase.json`. All of that lives only on the unmerged
`claude/firebase-emulators` branch. Running it requires merging that branch or standing up a
scratch Firebase project. Pointing the dev server at `.env.local` would hit `traxevent-prod`
and was deliberately not done.

Worth weighing: the final review's two most serious findings — the print route serving voided
proposals, and the editor reporting "Saved." while dropping a block — are both defects a
five-minute click-through would have surfaced immediately.

## Product decisions for the owner

1. **Expiry is enforced at end-of-day UTC, not end-of-day local.** For customers west of UTC a
   proposal stops working before their day ends. Fixing it properly needs an org or customer
   timezone, which the data model does not have. Documented on `proposalExpiryInstant` in
   `lib/proposals.ts`.
2. **An unselected packaged proposal prints a price range** (`$500.00 – $1500.00`) rather than
   a single figure, because a static document cannot know the customer's pick. The web page
   preselects the recommended tier and shows one number, so a customer holding both sees
   different headlines. Recommended follow-up: keep the range, label it — "Estimated range,
   depending on the option you choose", and on add-ons "Range assumes all add-ons selected."
3. **A declined proposal still prints a "Deposit due to accept" line.** It mirrors the web page
   exactly, so it is consistent — but it is odd copy on a declined document.

## Real defects, deferred deliberately

4. **Editing a block while a save is in flight loses those keystrokes** to the re-seed added for
   the silent-data-loss fix. The Save button disables during save; the text fields do not.
   Short window, and strictly better than the loss it replaced. Fix: disable block inputs while
   `saving`.
5. **`before_accept` expiry is checked when the PaymentIntent is created, not when the webhook
   promotes `pending_signature` to a signature.** A customer who opens the payment sheet while
   valid and completes the charge after the expiry instant still books. Narrow, but for
   `before_accept` the payment *is* the acceptance, so the guard is evaluated at the wrong
   moment. See `app/api/payments/webhook/route.ts`.
6. **Caps bound four fields; six are unbounded.** `normalizeBlocks` caps blocks, paragraph
   length, list items and item length, but heading `text`, testimonial `quote`, `attribution`,
   image `url`, `alt` and `caption` have no bound, and there is no total-document bound. Even
   within the declared caps, 100 blocks × 5000 chars exceeds the 1 MB Firestore document ceiling
   the caps exist to protect. Surfaces as a raw `INVALID_ARGUMENT` to the admin.
7. **Unsanitised `orgId` / `proposalId` in the storage path** (`actions/proposal-images.ts`),
   inherited verbatim from `uploadEvidencePhoto`. GCS keys are flat so there is no traversal
   today, and both ids are Firestore-generated. Fix both files together if ever fixed.
8. **Image MIME validation trusts the client's `File.type`** with no magic-byte sniffing. Same
   limitation as `uploadEvidencePhoto`. Lower risk here: the upload is `assertOrgAdmin`-gated
   and served from a separate GCS domain, so a spoof cannot become stored XSS against the app.

## Test coverage gaps

9. **`ProposalResponseClient` had zero tests before this increment.** Six were added to pin the
   selection behaviour the pricing extraction had to preserve, but **the sign, decline and
   Stripe deposit flows in that component remain untested** — the highest-value gap on this
   list, and independent of this branch.
10. `ProposalDocument`'s "keeps a valid block of each type" test asserts only array length, so a
    regression stripping `level` / `ordered` / `alt` / `attribution` would pass. The fields are
    preserved today; this is missing regression protection.
11. No exhaustiveness guard in `ProposalDocument`'s block switch. A sixth `ProposalBlock`
    variant would render nothing with no compile error. Two lines: `default: { const _x: never
    = block; return null }`.

## Known and tracked elsewhere

12. **Cloud Storage is not provisioned on `traxevent-prod`** — neither
    `traxevent-prod.firebasestorage.app` nor the legacy `.appspot.com` bucket exists, while
    Firestore works on the same credentials. Every image upload will throw in production until
    a bucket exists. Needs Firebase console owner access plus a decision on uniform
    bucket-level access, because the upload path calls `makePublic()`. Full write-up lives on
    the unmerged `claude/firebase-emulators` branch.

## Relevant to increment 2 (AI drafting) specifically

- Item 6 (unbounded fields) matters more once a generator is the producer — `normalizeBlocks` is
  the *only* validation point, and the generation schema cannot express length constraints.
- `parseInline` has no nesting concept, so `**a *b* c**` fragments into odd tokens. No crash and
  no HTML is ever emitted, but AI prose is far likelier than hand-typing to contain nested
  emphasis.
- `blk-N` id collisions become reachable the moment externally-authored ids are accepted. The
  fallback now walks forward to avoid colliding, but the `new-<21 digits>` IEEE-754 edge in the
  editor's counter is in the same family.
