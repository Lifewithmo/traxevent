import { requireNetworkMember } from '@/lib/auth/guards'

export default async function NetworkLayout({ children, params }: { children: React.ReactNode; params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  const { member } = await requireNetworkMember(networkSlug)
  const isAdmin = member.role === 'admin'
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-700 font-bold text-white text-lg">TraxEvent Network</div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 text-sm">
          <a href={`/network/${networkSlug}`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Dashboard</a>
          {isAdmin && <a href={`/network/${networkSlug}/templates`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Shared templates</a>}
          {isAdmin && <a href={`/network/${networkSlug}/regions`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Regions</a>}
          {isAdmin && <a href={`/network/${networkSlug}/onboard`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Onboard orgs</a>}
          {isAdmin && <a href={`/network/${networkSlug}/billing`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Billing</a>}
          {isAdmin && <a href={`/network/${networkSlug}/portal`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Portal & branding</a>}
        </nav>
      </aside>
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
