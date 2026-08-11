// Weekly gaming news, written by the n8n "Weekly News Digest" workflow into the
// Supabase `news` table and read here with the anon key (same pattern as the
// Game Pass rail). One curated pick per row: title, full summary, sources, image.
import { supabase } from './supabase.js'

// Keep roughly the last four weeks. week_of is a DATE (Monday of the digest week).
const WEEKS_KEPT = 4

export async function fetchNews() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - WEEKS_KEPT * 7)
  const cutoffIso = cutoff.toISOString().slice(0, 10) // YYYY-MM-DD

  const { data, error } = await supabase
    .from('news')
    .select('id, week_of, rank, title, summary, image_url, primary_url, sources, published_at')
    .gte('week_of', cutoffIso)
    .order('week_of', { ascending: false })
    .order('rank', { ascending: true })

  if (error) return []
  return (data || []).map((r) => ({
    id: r.id,
    weekOf: r.week_of,
    rank: r.rank,
    title: r.title,
    summary: r.summary,
    image: r.image_url || null,
    primaryUrl: r.primary_url,
    sources: normalizeSources(r.sources, r.primary_url),
    publishedAt: r.published_at || null,
  }))
}

// sources is jsonb: [{ name, url }]. Guard against nulls / bad shapes and fall
// back to the primary url so a card always has at least one working link.
function normalizeSources(raw, primaryUrl) {
  let list = []
  if (Array.isArray(raw)) list = raw
  const clean = list
    .filter((s) => s && typeof s.url === 'string' && s.url)
    .map((s) => ({ name: (s.name || hostOf(s.url)).toString(), url: s.url }))
  if (clean.length > 0) return clean
  if (primaryUrl) return [{ name: hostOf(primaryUrl), url: primaryUrl }]
  return []
}

export function hostOf(url) {
  try {
    return String(url).replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Group flat rows (already sorted week desc, rank asc) into week sections, capped
// at WEEKS_KEPT groups. Each group: { weekOf, items }.
export function groupByWeek(rows) {
  const groups = []
  const byWeek = new Map()
  for (const row of rows) {
    if (!byWeek.has(row.weekOf)) {
      const g = { weekOf: row.weekOf, items: [] }
      byWeek.set(row.weekOf, g)
      groups.push(g)
    }
    byWeek.get(row.weekOf).items.push(row)
  }
  return groups.slice(0, WEEKS_KEPT)
}
