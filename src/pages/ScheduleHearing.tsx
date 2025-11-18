import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppealsStore } from '../store'

export default function ScheduleHearing() {
  const { id } = useParams()
  const addHearing = useAppealsStore((s) => s.addHearing)
  const navigate = useNavigate()
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    judge: '',
    courtroom: '',
    notes: '',
    status: 'scheduled' as const,
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    addHearing(id, form)
    navigate(`/appeals/${id}`)
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
      <h1 className="mb-4 text-2xl font-semibold">Schedule Hearing</h1>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Date">
          <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="Judge">
          <input className="input" value={form.judge} onChange={(e) => setForm({ ...form, judge: e.target.value })} />
        </Field>
        <Field label="Courtroom">
          <input className="input" value={form.courtroom} onChange={(e) => setForm({ ...form, courtroom: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Notes</label>
          <textarea className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save</button>
        </div>
      </form>
      <style>{`.input{width:100%;border-radius:.375rem;border:1px solid #e5e7eb;padding:.5rem .75rem;outline:0} .input:focus{box-shadow:0 0 0 2px rgba(79,70,229,.5)}`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}


