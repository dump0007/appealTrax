import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppealsStore } from '../store'

export default function CreateAppeal() {
  const createAppeal = useAppealsStore((s) => s.createAppeal)
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    caseNumber: '',
    appellant: '',
    respondent: '',
    court: '',
    filedOn: new Date().toISOString().slice(0, 10),
    status: 'filed' as const,
    description: '',
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const id = createAppeal(form)
    navigate(`/appeals/${id}`)
  }

  return (
    <div className="mx-auto max-w-2xl rounded-xl border bg-white p-6">
      <h1 className="mb-4 text-2xl font-semibold">Create Appeal</h1>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </Field>
        <Field label="Case Number">
          <input className="input" value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })} required />
        </Field>
        <Field label="Appellant">
          <input className="input" value={form.appellant} onChange={(e) => setForm({ ...form, appellant: e.target.value })} required />
        </Field>
        <Field label="Respondent">
          <input className="input" value={form.respondent} onChange={(e) => setForm({ ...form, respondent: e.target.value })} required />
        </Field>
        <Field label="Court">
          <input className="input" value={form.court} onChange={(e) => setForm({ ...form, court: e.target.value })} required />
        </Field>
        <Field label="Filed On">
          <input type="date" className="input" value={form.filedOn} onChange={(e) => setForm({ ...form, filedOn: e.target.value })} required />
        </Field>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Description</label>
          <textarea className="w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Create</button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {children}
      <style>{`.input{width:100%;border-radius:.375rem;border:1px solid #e5e7eb;padding:.5rem .75rem;outline:0} .input:focus{box-shadow:0 0 0 2px rgba(79,70,229,.5)}`}</style>
    </div>
  )
}


