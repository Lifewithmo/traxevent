import { describe, it, expect } from 'vitest'
import { parseHandle, parsePublicProfile, RESERVED_HANDLES } from '@/lib/public-profile'

const VALID = {
  enabled: true,
  handle: 'abbyscoffeecorner',
  links: [{ id: 'l1', title: 'My menu', url: 'https://example.com/menu' }],
}

describe('parseHandle', () => {
  it.each(['abc', 'abbyscoffeecorner', 'a-1', 'a'.repeat(40), 'AbC'])('accepts %s', (h) => {
    expect(parseHandle(h)).toBe(h.toLowerCase())
  })
  it.each(['ab', 'a'.repeat(41), '-abc', 'abc-', 'ab_c', 'ab c', 'café', '', 42])(
    'rejects %s',
    (h) => {
      expect(() => parseHandle(h)).toThrow()
    },
  )
  it('rejects every reserved handle', () => {
    for (const h of RESERVED_HANDLES) expect(() => parseHandle(h)).toThrow('reserved')
  })
  it('trims and lowercases', () => {
    expect(parseHandle('  AbbysCoffee  ')).toBe('abbyscoffee')
  })
})

describe('parsePublicProfile', () => {
  it('parses a minimal valid profile', () => {
    expect(parsePublicProfile(VALID)).toEqual(VALID)
  })

  it('requires a handle', () => {
    expect(() => parsePublicProfile({ enabled: true, links: [] })).toThrow()
  })

  it('drops empty optional fields instead of storing them', () => {
    const out = parsePublicProfile({
      ...VALID,
      display_name: '  ',
      bio: '',
      photo_url: '',
      socials: { instagram: '', website: '' },
    })
    expect(out).not.toHaveProperty('display_name')
    expect(out).not.toHaveProperty('bio')
    expect(out).not.toHaveProperty('photo_url')
    expect(out).not.toHaveProperty('socials')
  })

  it('keeps present optional fields, trimmed', () => {
    const out = parsePublicProfile({
      ...VALID,
      display_name: ' Abby ',
      bio: ' Coffee lover ',
      photo_url: 'https://example.com/me.jpg',
      socials: { instagram: 'https://instagram.com/abbys', website: 'https://abbys.coffee' },
    })
    expect(out.display_name).toBe('Abby')
    expect(out.bio).toBe('Coffee lover')
    expect(out.photo_url).toBe('https://example.com/me.jpg')
    expect(out.socials).toEqual({
      instagram: 'https://instagram.com/abbys',
      website: 'https://abbys.coffee',
    })
  })

  it('enforces field caps', () => {
    expect(() => parsePublicProfile({ ...VALID, bio: 'x'.repeat(301) })).toThrow()
    expect(() =>
      parsePublicProfile({
        ...VALID,
        links: [{ id: 'l1', title: 'x'.repeat(121), url: 'https://a.io' }],
      }),
    ).toThrow()
    expect(() =>
      parsePublicProfile({
        ...VALID,
        links: [{ id: 'l1', title: 't', url: 'https://a.io', description: 'x'.repeat(301) }],
      }),
    ).toThrow()
  })

  it('rejects non-https and malformed URLs everywhere', () => {
    expect(() => parsePublicProfile({ ...VALID, photo_url: 'http://x.io/a.jpg' })).toThrow()
    expect(() => parsePublicProfile({ ...VALID, socials: { tiktok: 'not a url' } })).toThrow()
    expect(() =>
      parsePublicProfile({ ...VALID, links: [{ id: 'l1', title: 't', url: 'javascript:alert(1)' }] }),
    ).toThrow()
  })

  it('requires id, title, and url on every link', () => {
    for (const bad of [
      { title: 't', url: 'https://a.io' },
      { id: 'l1', url: 'https://a.io' },
      { id: 'l1', title: 't' },
    ]) {
      expect(() => parsePublicProfile({ ...VALID, links: [bad] })).toThrow()
    }
  })

  it('keeps link order and optional link fields', () => {
    const out = parsePublicProfile({
      ...VALID,
      links: [
        { id: 'a', title: 'First', url: 'https://a.io', description: 'desc', image_url: 'https://a.io/i.jpg' },
        { id: 'b', title: 'Second', url: 'https://b.io' },
      ],
    })
    expect(out.links.map((l) => l.id)).toEqual(['a', 'b'])
    expect(out.links[0].description).toBe('desc')
    expect(out.links[1]).not.toHaveProperty('description')
  })

  it('caps links at 30', () => {
    const links = Array.from({ length: 31 }, (_, i) => ({
      id: `l${i}`,
      title: `t${i}`,
      url: 'https://a.io',
    }))
    expect(() => parsePublicProfile({ ...VALID, links })).toThrow('30')
  })

  it('coerces enabled to a strict boolean', () => {
    expect(parsePublicProfile({ ...VALID, enabled: 'yes' }).enabled).toBe(false)
    expect(parsePublicProfile({ ...VALID, enabled: true }).enabled).toBe(true)
  })
})
