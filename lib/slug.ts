export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function buildCampSlug(name: string, year: number): string {
  const base = slugify(name)
  return `${base}-${year}`
}
