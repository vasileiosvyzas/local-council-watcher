// ── Types matching the analyses_out JSON format ───────────────────────────────

export interface RawAnalysis {
  // Required fields from LLM output
  summary_el: string
  topics: RawTopic[]
  // Optional enrichment fields (can be added manually to JSON or by ingest script)
  title?: string
  meeting_date?: string   // ISO date string e.g. "2025-09-08"
  video_url?: string
  youtube_id?: string
}

export interface RawTopic {
  title_el: string
  category: string
  keywords: string[]
  description_el: string
  decision_el?: string  // optional — only present when a decision was recorded
}

// ── Derived types used by the UI ──────────────────────────────────────────────

export interface Topic extends RawTopic {
  id: string          // `${meetingId}:${index}`
  meeting_id: string
}

export interface Meeting {
  id: string          // derived from filename slug
  slug: string        // filename without extension e.g. "2025-09-08_xylokastro"
  title: string       // from JSON or derived from slug
  meeting_date: string | null
  video_url: string | null
  youtube_id: string | null
  summary_el: string
  topics: Topic[]
  topic_count: number
}

export interface MeetingListItem extends Omit<Meeting, 'topics'> {}

export interface SearchResult {
  meeting_id: string
  meeting_title: string
  meeting_date: string | null
  video_url: string | null
  topic_title_el: string
  topic_category: string
  topic_description_el: string
  topic_decision_el: string | null
  keywords: string[]
}

// ── Load all JSON files from analyses_out/ at build time ──────────────────────

const rawFiles = import.meta.glob('../../test_analysis/*.json', { eager: true }) as Record<
  string,
  { default: RawAnalysis }
>

function slugFromPath(path: string): string {
  return path.split('/').pop()?.replace(/\.json$/, '') ?? path
}

function titleFromSlug(slug: string): string {
  // "2025-09-08_xylokastro" → "Xylokastro - 08/09/2025"
  // or just prettify the slug if no date prefix
  const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})_?(.*)$/)
  if (dateMatch) {
    const [, date, rest] = dateMatch
    const [y, m, d] = date.split('-')
    const pretty = rest.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return pretty ? `${pretty} — ${d}/${m}/${y}` : `Συνεδρίαση ${d}/${m}/${y}`
  }
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function dateFromSlug(slug: string): string | null {
  const match = slug.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function buildMeetings(): Meeting[] {
  return Object.entries(rawFiles)
    .map(([path, mod]) => {
      const raw = mod.default
      const slug = slugFromPath(path)
      const id = slug

      const topics: Topic[] = (raw.topics ?? []).map((t, i) => ({
        ...t,
        id: `${id}:${i}`,
        meeting_id: id,
      }))

      return {
        id,
        slug,
        title: raw.title ?? titleFromSlug(slug),
        meeting_date: raw.meeting_date ?? dateFromSlug(slug),
        video_url: raw.video_url ?? null,
        youtube_id: raw.youtube_id ?? null,
        summary_el: raw.summary_el ?? '',
        topics,
        topic_count: topics.length,
      } satisfies Meeting
    })
    .sort((a, b) => {
      // Sort newest first
      if (!a.meeting_date && !b.meeting_date) return 0
      if (!a.meeting_date) return 1
      if (!b.meeting_date) return -1
      return b.meeting_date.localeCompare(a.meeting_date)
    })
}

// Singleton — parsed once at module load
const _meetings: Meeting[] = buildMeetings()

// ── Public API (mirrors the old HTTP API shape) ───────────────────────────────

export function fetchMeetings(): Promise<MeetingListItem[]> {
  return Promise.resolve(_meetings.map(({ topics: _, ...rest }) => rest))
}

export function fetchMeeting(id: string): Promise<Meeting | null> {
  return Promise.resolve(_meetings.find(m => m.id === id) ?? null)
}

export function searchTopics(query: string): Promise<SearchResult[]> {
  const q = query.toLowerCase().trim()
  if (!q) return Promise.resolve([])

  const results: SearchResult[] = []
  for (const meeting of _meetings) {
    for (const topic of meeting.topics) {
      const matches =
        topic.title_el.toLowerCase().includes(q) ||
        topic.description_el.toLowerCase().includes(q) ||
        (topic.decision_el ?? '').toLowerCase().includes(q) ||
        topic.keywords.some(k => k.toLowerCase().includes(q))
      if (matches) {
        results.push({
          meeting_id: meeting.id,
          meeting_title: meeting.title,
          meeting_date: meeting.meeting_date,
          video_url: meeting.video_url,
          topic_title_el: topic.title_el,
          topic_category: topic.category,
          topic_description_el: topic.description_el,
          topic_decision_el: topic.decision_el ?? null,
          keywords: topic.keywords,
        })
      }
    }
  }
  return Promise.resolve(results)
}

export function fetchCategories(): Promise<string[]> {
  const cats = new Set(_meetings.flatMap(m => m.topics.map(t => t.category)))
  return Promise.resolve([...cats].sort())
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  taxation: 'Φορολογία',
  budget: 'Προϋπολογισμός',
  infrastructure: 'Υποδομές',
  environment: 'Περιβάλλον',
  public_safety: 'Δημόσια Ασφάλεια',
  education: 'Παιδεία',
  culture: 'Πολιτισμός',
  housing: 'Στέγαση',
  administration: 'Διοίκηση',
  other: 'Άλλο',
}
