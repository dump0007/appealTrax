import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="text-center">
      <h1 className="mb-2 text-2xl font-semibold">Page not found</h1>
      <p className="mb-4 text-sm text-gray-600">The page you are looking for doesn't exist.</p>
      <Link to="/" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Go Home</Link>
    </div>
  )
}








