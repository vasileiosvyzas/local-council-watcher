import { Outlet, NavLink } from 'react-router-dom'
import { Building2, Search, List } from 'lucide-react'

export default function Layout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-100 text-blue-700'
        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
    }`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
          <div className="flex items-center gap-2 font-semibold text-gray-900 mr-4">
            <Building2 size={20} className="text-blue-600" />
            <span>Δημοτικό Συμβούλιο</span>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              <List size={16} />
              Συνεδριάσεις
            </NavLink>
            <NavLink to="/search" className={linkClass}>
              <Search size={16} />
              Αναζήτηση
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
