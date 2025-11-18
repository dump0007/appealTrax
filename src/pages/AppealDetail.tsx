import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAppealsStore } from '../store'

export default function AppealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const appeal = useAppealsStore((s) => s.appeals.find((a) => a.id === id))
  if (!appeal) return <div className="text-sm text-gray-500">Appeal not found.</div>
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{appeal.title}</h1>
        <div className="flex items-center gap-2">
          <Link to={`/appeals/${appeal.id}/schedule`} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Schedule Hearing</Link>
          <button onClick={() => navigate(-1)} className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">Back</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 sm:col-span-2">
          <h2 className="mb-3 text-lg font-medium">Case Info</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="Case Number" value={appeal.caseNumber} />
            <Info label="Court" value={appeal.court} />
            <Info label="Appellant" value={appeal.appellant} />
            <Info label="Respondent" value={appeal.respondent} />
            <Info label="Filed On" value={appeal.filedOn} />
            <Info label="Status" value={appeal.status} />
          </div>
          {appeal.description && (
            <div className="mt-4 text-sm text-gray-700">{appeal.description}</div>
          )}
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-medium">Hearings</h2>
          <ul className="divide-y">
            {appeal.hearings.map((h) => (
              <li key={h.id} className="py-3 text-sm">
                <div className="font-medium">{h.date} · {h.status}</div>
                <div className="text-gray-500">{h.judge || '—'} · Room {h.courtroom || '—'}</div>
                {h.notes && <div className="text-gray-700">{h.notes}</div>}
              </li>
            ))}
            {appeal.hearings.length === 0 && <li className="py-6 text-sm text-gray-500">No hearings yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value || '—'}</div>
    </div>
  )
}








