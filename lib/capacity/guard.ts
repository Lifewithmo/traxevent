/**
 * The server-side capacity guard's result shape (increment 4).
 *
 * MODELED AS A RETURN VALUE, not a thrown error — and this is load-bearing, not
 * a style choice. Next 16's RSC flight layer REDACTS thrown Server Action errors
 * in a production build: the compiled server emits only a `{ digest }` chunk and
 * the client reconstructs a generic `Error` — message replaced with a canned
 * "An error occurred in the Server Components render…", `name` = 'Error', no
 * custom `code` (see react-server-dom-*-server/-client `.production.js`). A
 * thrown guard was therefore indistinguishable from a real failure on the client
 * in prod, so the advisory guard silently degraded into an unconditional HARD
 * BLOCK: an over-capacity or clashing win could never be confirmed-and-overridden
 * from any of the four UI surfaces. (It only ever "worked" under `next dev`,
 * where the real message crosses, and in vitest, where the mock threw a
 * dev-shaped error object.)
 *
 * Return values serialize intact in BOTH dev and prod — this is Next's own
 * guidance ("model expected errors as return values; avoid try/catch and
 * throwing" for expected, recoverable conditions). `setLeadStage` returns
 * `{ ok: true }` once the write lands, and `{ ok: false, guard }` when the win
 * is refused pending an override, where `guard` is the human confirm copy. Each
 * client caller checks `ok`, `window.confirm(guard)`, and on accept re-calls
 * `setLeadStage(…, { override: true })`. Genuine failures (permission, invalid
 * stage, network) still throw and are caught separately.
 */
export type StageChangeResult = { ok: true } | { ok: false; guard: string }
