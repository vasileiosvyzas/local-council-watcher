import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { parse, format } from 'date-fns'
import { el } from 'date-fns/locale'
import { fetchMeetings, MeetingListItem } from '../lib/api'
import { CalendarDays, Tag, ExternalLink } from 'lucide-react'

function MeetingCard({ meeting }: { meeting: MeetingListItem }) {
  const date = meeting.meeting_date
    ? format(new Date(meeting.meeting_date), 'd MMMM yyyy', { locale: el })
    : 'Άγνωστη ημερομηνία'

  // const date = meeting.meeting_date
  // ? format(parse(meeting.meeting_date, "d/M/yyyy", new Date()), "d MMMM yyyy", { locale: el })
  // : "Άγνωστη ημερομηνία"
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link
            to={`/meetings/${meeting.id}`}
            className="text-base font-semibold text-gray-900 hover:text-blue-600 line-clamp-2"
          >
            {meeting.title}
          </Link>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <CalendarDays size={13} />
              {date}
            </span>
            <span className="flex items-center gap-1">
              <Tag size={13} />
              {meeting.topic_count} θέματα
            </span>
          </div>
          {meeting.summary_el && (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">{meeting.summary_el}</p>
          )}
        </div>
        {meeting.video_url && (
          <a
            href={meeting.video_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-red-500 flex-shrink-0 mt-0.5"
            title="Άνοιγμα στο YouTube"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  )
}

export default function MeetingsPage() {
  const { data: meetings, isLoading, error } = useQuery({
    queryKey: ['meetings'],
    queryFn: fetchMeetings,
  })

  if (isLoading) return <div className="text-gray-500 text-center py-12">Φόρτωση...</div>
  if (error) return <div className="text-red-500 text-center py-12">Σφάλμα φόρτωσης δεδομένων</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Συνεδριάσεις Δημοτικού Συμβουλίου</h1>
        <p className="text-gray-500 mt-1">{meetings?.length ?? 0} συνεδριάσεις</p>
      </div>
      <div className="flex flex-col gap-3">
        {meetings?.map(m => <MeetingCard key={m.id} meeting={m} />)}
        {meetings?.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">Δεν βρέθηκαν συνεδριάσεις.</p>
            <p className="text-sm mt-1">Προσθέστε JSON αρχεία στον φάκελο <code>analyses_out/</code>.</p>
          </div>
        )}
      </div>
    </div>
  )
}
