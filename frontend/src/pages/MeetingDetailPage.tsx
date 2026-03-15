import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import { fetchMeeting, CATEGORY_LABELS, Topic } from '../lib/api'
import { ArrowLeft, ExternalLink, Tag } from 'lucide-react'

const CATEGORY_COLORS: Record<string, string> = {
  taxation: 'bg-red-100 text-red-700',
  budget: 'bg-orange-100 text-orange-700',
  infrastructure: 'bg-yellow-100 text-yellow-700',
  environment: 'bg-green-100 text-green-700',
  public_safety: 'bg-blue-100 text-blue-700',
  education: 'bg-purple-100 text-purple-700',
  culture: 'bg-pink-100 text-pink-700',
  housing: 'bg-indigo-100 text-indigo-700',
  administration: 'bg-gray-100 text-gray-700',
  other: 'bg-gray-100 text-gray-600',
}

function TopicCard({ topic }: { topic: Topic }) {
  const colorClass = CATEGORY_COLORS[topic.category] ?? CATEGORY_COLORS.other
  const label = CATEGORY_LABELS[topic.category] ?? topic.category
  const hasDecision = topic.decision_el && topic.decision_el.trim().length > 0

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-gray-900">{topic.title_el}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${colorClass}`}>
          {label}
        </span>
      </div>
      <p className="text-sm text-gray-600 mt-2 mb-3">{topic.description_el}</p>

      {hasDecision && (
        <div className="border-l-2 border-amber-400 bg-amber-50 rounded-r-md px-3 py-2.5 mb-3">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Απόφαση</p>
          <p className="text-sm text-amber-900 leading-relaxed">{topic.decision_el}</p>
        </div>
      )}

      {topic.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topic.keywords.map(k => (
            <Link
              key={k}
              to={`/search?q=${encodeURIComponent(k)}`}
              className="text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-600 px-2 py-0.5 rounded transition-colors"
            >
              {k}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: meeting, isLoading, error } = useQuery({
    queryKey: ['meeting', id],
    queryFn: () => fetchMeeting(id!),
    enabled: !!id,
  })

  if (isLoading) return <div className="text-gray-500 text-center py-12">Φόρτωση...</div>
  if (error || !meeting) return <div className="text-red-500 text-center py-12">Σφάλμα φόρτωσης</div>

  const date = meeting.meeting_date
    ? format(new Date(meeting.meeting_date), 'd MMMM yyyy', { locale: el })
    : null

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-5">
        <ArrowLeft size={15} /> Πίσω
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{meeting.title}</h1>
            {date && <p className="text-gray-500 text-sm mt-1">{date}</p>}
          </div>
          {meeting.video_url && (
            <a
              href={meeting.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium flex-shrink-0"
            >
              <ExternalLink size={15} />
              YouTube
            </a>
          )}
        </div>

        {meeting.summary_el && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Περίληψη</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{meeting.summary_el}</p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Tag size={18} />
          Θέματα ({meeting.topics.length})
        </h2>
        <div className="flex flex-col gap-3">
          {meeting.topics.map(t => <TopicCard key={t.id} topic={t} />)}
        </div>
      </div>
    </div>
  )
}
