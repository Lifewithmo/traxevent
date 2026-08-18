/**
 * Re-book cadence: how often, in months, a client comes back — projected forward
 * so dormancy is measured against *their* beat instead of a flat six-month rule.
 * A yearly client silent seven months is on time; a monthly client silent three
 * is already overdue. The old `monthsSinceLastEvent >= 6` test got both wrong.
 *
 * The beat math now lives in client-list.ts (buildClientRow/buildClientList
 * consume it, and importing from here would be a cycle). This module re-exports
 * so existing importers — next-best-action.ts, client-story.ts, cadence.test.ts —
 * keep resolving `@/lib/crm/cadence` unchanged.
 */
export { effectiveCadenceMonths, projectedNextBooking, offBeatMonths } from './client-list'
