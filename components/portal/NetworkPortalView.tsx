import { portalThemeVars } from '@/lib/portal'
import type { NetworkPortal, PublicNetwork } from '@/actions/network-portal'

function formatRange(start: string, end: string): string {
  if (start && end && start !== end) return `${start} – ${end}`
  return start || end || ''
}

export function NetworkPortalView({ portal }: { portal: NetworkPortal }) {
  const { network, events }: { network: PublicNetwork; events: NetworkPortal['events'] } = portal
  const title = network.display_name || network.name

  return (
    <main style={portalThemeVars(network)} className="min-h-screen bg-gray-50">
      <header
        className="px-6 py-10 text-white"
        style={{ backgroundColor: 'var(--portal-primary, #2563EB)' }}
      >
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          {network.logo_url && (
            <img
              src={network.logo_url}
              alt={title}
              className="h-12 w-auto rounded bg-white/10 p-1"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--portal-primary-text, #ffffff)' }}>
              {title}
            </h1>
            <p className="text-sm opacity-90">Upcoming events across our member organizations</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-10">
        {events.length === 0 ? (
          <p className="text-gray-600">No upcoming events right now.</p>
        ) : (
          <ul className="space-y-4">
            {events.map((e) => (
              <li
                key={e.registerPath}
                className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{e.campName}</h2>
                  <p className="text-sm text-gray-600">{e.orgName}</p>
                  <p className="text-sm text-gray-500">{formatRange(e.camp_start, e.camp_end)}</p>
                </div>
                <a
                  href={e.registerPath}
                  className="shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--portal-accent, #059669)' }}
                >
                  Register
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
