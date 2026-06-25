import { requireNetworkAdmin } from '@/lib/auth/guards'

export default async function NetworkLayout({ children, params }: { children: React.ReactNode; params: Promise<{ networkSlug: string }> }) {
  const { networkSlug } = await params
  await requireNetworkAdmin(networkSlug)
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 bg-gray-900 text-gray-100 min-h-screen flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-700 font-bold text-white text-lg">TraxEvent Network</div>
        <nav className="flex-1 px-2 py-4 space-y-0.5 text-sm">
          <a href={`/network/${networkSlug}`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Dashboard</a>
          <a href={`/network/${networkSlug}/templates`} className="block px-3 py-2 rounded-md text-gray-300 hover:bg-gray-700 hover:text-white">Shared templates</a>
        </nav>
      </aside>
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  )
}
