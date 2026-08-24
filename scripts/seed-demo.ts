import { parseSeedArgs } from '@/scripts/seed/args'

// Run via `npm run seed:demo` — it sets --conditions=react-server so 'server-only'
// (imported transitively via lib/firebase-admin) resolves to its no-throw module
// under tsx.
//
// This entry stays free of firebase-admin imports on purpose: `--dry-run`
// must be able to print the write plan with no Firebase env at all, so the
// writer modules are loaded dynamically only on the paths that write.
//
//   (no addition flags)      → the original full BrewTrax demo seed
//                              (scripts/seed/full-seed.ts, unchanged behavior)
//   --with-market-days       → add the "City Market Saturdays" season to the
//                              existing demo org
//   --with-roster-org        → (re)create the Pinecrest Day Camp roster org
//   --claims-org=<demo-...>  → point the demo user's auth claims at that org
//   --dry-run                → print the addition flags' write plan, write nothing

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2))

  if (args.dryRun) {
    const { printAdditionsPlan } = await import('@/scripts/seed/additions-plan')
    printAdditionsPlan(args, new Date())
    return
  }

  if (args.withMarketDays || args.withRosterOrg || args.claimsOrg) {
    const { runAdditions } = await import('@/scripts/seed/additions')
    await runAdditions(args)
    return
  }

  const { runFullSeed } = await import('@/scripts/seed/full-seed')
  await runFullSeed(args)
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
