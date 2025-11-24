import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../store'

export default function AppLayout() {
  const user = useAuthStore((s) => s.currentUser)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  return (
    <div className="min-h-full bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link 
              to="/" 
              className="text-xl font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer transition-colors"
              title="Go to Dashboard"
            >
              WritTrax
            </Link>
            <nav className="hidden gap-4 sm:flex">
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                to="/"
              >
                Dashboard
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                to="/firs"
              >
                Writs
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 ${
                    isActive ? 'bg-indigo-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                to="/proceedings"
              >
                Proceedings
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="text-sm text-gray-600">
                Signed in as <span className="font-medium text-gray-900">{user.email}</span>
              </div>
            )}
            {user && (
              <button
                onClick={() => { logout(); navigate('/login') }}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}








