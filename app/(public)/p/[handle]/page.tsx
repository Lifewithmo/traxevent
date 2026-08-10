export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOrgByHandle } from '@/lib/public-profile-server'
import { getBrand, DEFAULT_BRAND_ID } from '@/lib/brands'
import { readableTextOn } from '@/lib/branding'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const org = await getOrgByHandle(handle)
  if (!org?.public_profile) return {}
  const profile = org.public_profile
  const title = profile.display_name ?? org.branding?.display_name ?? org.name
  return {
    title,
    description: profile.bio,
    openGraph: {
      title,
      description: profile.bio,
      ...(profile.photo_url ? { images: [profile.photo_url] } : {}),
    },
  }
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const org = await getOrgByHandle(handle)
  if (!org?.public_profile) notFound()

  const profile = org.public_profile
  const displayName = profile.display_name ?? org.branding?.display_name ?? org.name
  const accent = org.branding?.accent_color ?? '#111827'
  const accentText = readableTextOn(accent)
  const brand = getBrand(org.brand_id)
  const socials = Object.entries(profile.socials ?? {})

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 py-10">
      <header className="flex flex-col items-center text-center">
        {profile.photo_url && (
          // Plain <img>: same rationale as brand assets — public, small, and
          // next/image would need remotePatterns for the storage host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photo_url}
            alt={displayName}
            className="h-24 w-24 rounded-full border border-gray-200 object-cover"
          />
        )}
        <h1 className="mt-4 text-2xl font-bold">{displayName}</h1>
        {profile.bio && <p className="mt-1 text-sm text-gray-600">{profile.bio}</p>}
        {socials.length > 0 && (
          <nav aria-label="Social links" className="mt-3 flex flex-wrap justify-center gap-2">
            {socials.map(([network, url]) => (
              <a
                key={network}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-gray-300 px-3 py-1 text-xs font-medium capitalize text-gray-700 hover:bg-gray-50"
              >
                {network}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main className="mt-8 flex flex-col gap-3">
        {profile.links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition hover:opacity-90"
            style={{ backgroundColor: accent, borderColor: accent, color: accentText }}
          >
            {link.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={link.image_url}
                alt=""
                className="h-12 w-12 flex-none rounded-lg bg-white object-cover"
              />
            )}
            <span className="min-w-0 flex-1 text-center">
              <span className="block font-semibold">{link.title}</span>
              {link.description && (
                <span className="mt-0.5 block text-xs opacity-80">{link.description}</span>
              )}
            </span>
          </a>
        ))}
      </main>

      <footer className="mt-auto pt-10 text-center text-xs text-gray-400">
        <a
          href={brand.id === DEFAULT_BRAND_ID ? '/' : `/brand/${brand.id}`}
          className="hover:text-gray-600"
        >
          Powered by {brand.name}
        </a>
      </footer>
    </div>
  )
}
