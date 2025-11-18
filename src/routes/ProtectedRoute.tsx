import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.currentUser)
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}


