import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.currentUser)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  
  if (!user) return <Navigate to="/login" replace />
  
  // User panel requires USER role - redirect if admin
  if (isAdmin()) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2 text-gray-600">Administrators must use the admin panel to access their account.</p>
        </div>
      </div>
    )
  }
  
  return <>{children}</>
}


