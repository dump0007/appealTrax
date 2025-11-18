import { Link } from 'react-router-dom'
import { useAppealsStore } from '../store'

export default function AppealsList() {
  const appeals = useAppealsStore((s) => s.appeals)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Appeals</h1>
        <Link to="/appeals/new" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">New Appeal</Link>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="min-w-full">
          <thead className="bg-gray-50 text-left text-sm text-gray-600">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Case Number</th>
              <th className="px-4 py-3">Court</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"/>
            </tr>
          </thead>
          <tbody className="divide-y text-sm">
            {appeals.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-gray-500">{a.appellant} vs {a.respondent}</div>
                </td>
                <td className="px-4 py-3">{a.caseNumber}</td>
                <td className="px-4 py-3">{a.court}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">{a.status}</span></td>
                <td className="px-4 py-3 text-right"><Link to={`/appeals/${a.id}`} className="text-indigo-600 hover:underline">View</Link></td>
              </tr>
            ))}
            {appeals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No appeals found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}








