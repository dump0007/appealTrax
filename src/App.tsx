import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './routes/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
// import Signup from './pages/Signup' // Commented out - signup functionality disabled
import Dashboard from './pages/Dashboard'
import FIRs from './pages/FIRs'
import FIRDetail from './pages/FIRDetail'
import Proceedings from './pages/Proceedings'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Signup route commented out - signup functionality disabled
      <Route path="/signup" element={<Signup />} />
      */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="firs" element={<FIRs />} />
        <Route path="firs/:firId" element={<FIRDetail />} />
        <Route path="proceedings" element={<Proceedings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
