import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { el } from 'date-fns/locale'
import { searchTopics, CATEGORY_LABELS, SearchResult } from '../lib/api'
import { Search, CalendarDays, ArrowRight } from 'lucide-react'

const CATEGORY_DOTS: Record<string, string> = {
  administration: 'bg-gray-400',
  budget: 'bg-amber-400',
  infrastructure: 'bg-blue-400',
  environment: 'bg-green-400',
  public_safety: 'bg-red-400',
  education: 'bg-purple-400',
  culture: 'bg-pink-400',
  housing: 'bg-sky-400',
  taxation: 'bg-orange-400',
  other: 'bg-gray-300',
}

function ResultCard({ result }: { result: SearchResult }) {
  const date = result.meeting_date
    ? format(new Date(result.meeting_date), 'MMM yyyy', { locale: el })
    : '—'
  const hasDecision = result.topic_decision_el && result.topic_decision_el.trim().length > 0

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start gap-4">
        <div className="text-center flex-shrink-0 w-14">
          <span className="text-xs font-semibold text-gray-400 uppercase">{date}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{result.topic_title_el}</p>
          <p className="text-sm text-gray-600 mt-1 mb-2">{result.topic_description_el}</p>

          {hasDecision && (
            <div className="border-l-2 border-amber-400 bg-amber-50 rounded-r-md px-3 py-2 mb-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Απόφαση</p>
              <p className="text-sm text-amber-900 leading-relaxed">{result.topic_decision_el}</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-1">
            <Link
              to={`/meetings/${result.meeting_id}`}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              {result.meeting_title} <ArrowRight size={12} />
            </Link>
            <span className="text-xs text-gray-400">
              {CATEGORY_LABELS[result.topic_category] ?? result.topic_category}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineView({ results }: { results: SearchResult[] }) {
  return (
    <div className="flex flex-col gap-2">
      {results.map((r, i) => {
        const dotClass = CATEGORY_DOTS[r.topic_category] ?? CATEGORY_DOTS.other
        return (
          <div key={i} className="flex gap-3 items-stretch">
            <div className="flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full mt-4 flex-shrink-0 ${dotClass}`} />
              {i < results.length - 1 && <div className="w-0.5 bg-gray-200 flex-1 mt-1" />}
            </div>
            <div className="flex-1 pb-2">
              <ResultCard result={r} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputValue, setInputValue] = useState(searchParams.get('q') ?? '')
  const query = searchParams.get('q') ?? ''

  const { data: results, isLoading } = useQuery({
    queryKey: ['search', query],
    queryFn: () => searchTopics(query),
    enabled: query.length > 0,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputValue.trim()) {
      setSearchParams({ q: inputValue.trim() })
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Αναζήτηση Θεμάτων</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="π.χ. δημοτικά τέλη, προϋπολογισμός, οδοποιία..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Αναζήτηση
          </button>
        </div>
      </form>

      {query && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">
            {isLoading
              ? 'Αναζήτηση...'
              : `${results?.length ?? 0} αποτελέσματα για "${query}"`}
          </h2>
        </div>
      )}

      {results && results.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
            <CalendarDays size={12} /> Ταξινόμηση από νεότερο προς παλαιότερο
          </p>
          <TimelineView results={results} />
        </div>
      )}

      {results?.length === 0 && query && (
        <div className="text-center py-16 text-gray-400">
          <p>Δεν βρέθηκαν θέματα για "{query}"</p>
        </div>
      )}

      {!query && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Αναζητήστε θέματα που συζητήθηκαν στις συνεδριάσεις</p>
          <p className="text-xs mt-1">π.χ. «φόρος», «ύδρευση», «σχολεία»</p>
        </div>
      )}
    </div>
  )
}
