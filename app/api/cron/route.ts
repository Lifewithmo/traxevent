import { NextResponse } from 'next/server'
import { runEveningSend } from '@/lib/ops/evening-send'

// Hourly cron tick (vercel.json `crons` — Vercel invokes this in UTC; org-local
// scheduling happens inside each consumer via Org.timezone). One route, many
// consumers over time: evening-before run sheets today; the invoice-overdue
// sweep and re-book digests are the named next tenants (inc-3 S1.3).
//
// PRE-MERGE HUMAN GATES (inc-3 B2, carried in the PR body): the Vercel plan
// must accept hourly cron schedules (a non-Pro plan FAILS DEPLOYMENT on
// vercel.json's crons block), and CRON_SECRET must be set in the dashboard.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // FAIL CLOSED (B1): an explicit unset/empty check, never compare-to-undefined
  // equality — with no CRON_SECRET configured, `authHeader === `Bearer
  // ${undefined}`` -style comparisons can be satisfied by a crafted header, so
  // the route refuses to run AT ALL until the secret exists.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run (fail-closed)')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runEveningSend()
    // Observable tick (B1): the summary is BOTH logged and returned, so a
    // human can read the last run in the Vercel logs or by curling the route.
    console.log('[cron] evening-send', JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err) {
    // Per-org failures are isolated inside runEveningSend (they surface in
    // summary.errors); reaching here means the tick itself broke (e.g. the
    // all-orgs enumeration failed) — a loud 500, never a silent 200.
    console.error('[cron] evening-send tick failed', err)
    return NextResponse.json({ error: 'Cron tick failed' }, { status: 500 })
  }
}
