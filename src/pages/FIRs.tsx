import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createFIR, fetchFIRs } from '../lib/api'
import type { CreateFIRInput, FIR, FIRStatus } from '../types'

const STATUS_OPTIONS: FIRStatus[] = [
  'REGISTERED',
  'UNDER_INVESTIGATION',
  'ONGOING_HEARING',
  'CHARGESHEET_FILED',
  'CLOSED',
  'WITHDRAWN',
]

const INITIAL_FORM: CreateFIRInput = {
  firNumber: '',
  title: '',
  description: '',
  dateOfFiling: '',
  sections: [],
  branch: '',
  investigatingOfficer: '',
  investigatingOfficerRank: '',
  investigatingOfficerPosting: '',
  investigatingOfficerContact: 0,
  petitionerName: '',
  petitionerFatherName: '',
  petitionerAddress: '',
  petitionerPrayer: '',
  respondents: [],
  status: 'REGISTERED',
  linkedWrits: [],
}

export default function FIRs() {
  const navigate = useNavigate()
  const [firs, setFirs] = useState<FIR[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formData, setFormData] = useState<CreateFIRInput>(INITIAL_FORM)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const [listError, setListError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const data = await fetchFIRs()
        setFirs(data)
        setListError(null)
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Unable to fetch FIRs')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const filteredFirs = useMemo(() => {
    return firs.filter((fir) => {
      const matchesSearch =
        !search ||
        [
          fir.firNumber,
          fir.title,
          fir.petitionerName,
          fir.branch,
          fir.investigatingOfficer,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || fir.status === statusFilter
      const matchesBranch =
        !branchFilter ||
        fir.branch.toLowerCase().includes(branchFilter.trim().toLowerCase())
      return matchesSearch && matchesStatus && matchesBranch
    })
  }, [firs, search, statusFilter, branchFilter])

  const visibleFirs = filteredFirs.slice(0, visibleCount)
  const canShowMore = filteredFirs.length > visibleCount

  function handleInputChange<K extends keyof CreateFIRInput>(key: K, value: CreateFIRInput[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function parseListInput(value: string) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setFormSubmitting(true)
      setFormError(null)
      const payload: CreateFIRInput = {
        ...formData,
        sections: formData.sections,
        respondents: formData.respondents,
        linkedWrits: formData.linkedWrits?.filter((id) => id),
      }
      const created = await createFIR(payload)
      setFirs((prev) => [created, ...prev])
      setFormData(INITIAL_FORM)
      setFormOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create FIR')
    } finally {
      setFormSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            title="Go back to previous page"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">FIRs</h1>
            <p className="text-sm text-gray-500">
              Create new FIRs and manage existing investigations in one place.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {formOpen ? 'Close Form' : 'Create New FIR'}
        </button>
      </div>

      {formOpen && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">New FIR Details</h2>
          <p className="text-sm text-gray-500">
            Fill out all mandatory fields to register a new FIR in the system.
          </p>
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="FIR Number"
                value={formData.firNumber}
                onChange={(value) => handleInputChange('firNumber', value)}
                required
              />
              <TextField
                label="Title"
                value={formData.title}
                onChange={(value) => handleInputChange('title', value)}
                required
              />
              <label className="text-sm font-medium text-gray-700">
                Date of Filing
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  value={formData.dateOfFiling}
                  onChange={(e) => handleInputChange('dateOfFiling', e.target.value)}
                  required
                />
              </label>
              <TextField
                label="Branch"
                value={formData.branch}
                onChange={(value) => handleInputChange('branch', value)}
                required
              />
              <TextField
                label="Investigating Officer"
                value={formData.investigatingOfficer}
                onChange={(value) => handleInputChange('investigatingOfficer', value)}
                required
              />
              <TextField
                label="Officer Rank"
                value={formData.investigatingOfficerRank}
                onChange={(value) => handleInputChange('investigatingOfficerRank', value)}
                required
              />
              <TextField
                label="Officer Posting"
                value={formData.investigatingOfficerPosting}
                onChange={(value) => handleInputChange('investigatingOfficerPosting', value)}
                required
              />
              <label className="text-sm font-medium text-gray-700">
                Officer Contact
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  value={formData.investigatingOfficerContact || ''}
                  onChange={(e) =>
                    handleInputChange('investigatingOfficerContact', Number(e.target.value) || 0)
                  }
                  required
                />
              </label>
              <TextField
                label="Petitioner Name"
                value={formData.petitionerName}
                onChange={(value) => handleInputChange('petitionerName', value)}
                required
              />
              <TextField
                label="Petitioner Father Name"
                value={formData.petitionerFatherName}
                onChange={(value) => handleInputChange('petitionerFatherName', value)}
                required
              />
              <TextField
                label="Petitioner Address"
                value={formData.petitionerAddress}
                onChange={(value) => handleInputChange('petitionerAddress', value)}
                required
              />
              <TextField
                label="Petitioner Prayer"
                value={formData.petitionerPrayer}
                onChange={(value) => handleInputChange('petitionerPrayer', value)}
                required
              />
              <TextField
                label="Sections (comma separated)"
                value={formData.sections.join(', ')}
                onChange={(value) => handleInputChange('sections', parseListInput(value))}
                placeholder="IPC 420, IPC 120B"
              />
              <TextField
                label="Respondents (comma separated)"
                value={formData.respondents.join(', ')}
                onChange={(value) => handleInputChange('respondents', parseListInput(value))}
                placeholder="Respondent 1, Respondent 2"
              />
              <TextField
                label="Linked Writ IDs (comma separated)"
                value={(formData.linkedWrits || []).join(', ')}
                onChange={(value) => handleInputChange('linkedWrits', parseListInput(value))}
                placeholder="Optional Mongo IDs"
              />
              <label className="text-sm font-medium text-gray-700">
                Status
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value as FIRStatus)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="text-sm font-medium text-gray-700">
              Description
              <textarea
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                rows={4}
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                required
              />
            </label>

            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setFormData(INITIAL_FORM)
                  setFormOpen(false)
                  setFormError(null)
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {formSubmitting ? 'Saving...' : 'Save FIR'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">All FIRs</h2>
            <p className="text-sm text-gray-500">
              {filteredFirs.length} record{filteredFirs.length === 1 ? '' : 's'} found
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search FIRs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Branch filter"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {listError && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {listError}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">FIR Number</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Petitioner</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Filed On</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm text-gray-700">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Loading FIRs…
                  </td>
                </tr>
              )}
              {!loading && visibleFirs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No FIRs match the selected filters.
                  </td>
                </tr>
              )}
              {visibleFirs.map((fir) => (
                <tr
                  key={fir._id}
                  className="cursor-pointer transition hover:bg-indigo-50"
                  onClick={() => navigate(`/firs/${fir._id}`)}
                >
                  <td className="px-4 py-3 font-medium">{fir.firNumber}</td>
                  <td className="px-4 py-3">{fir.title}</td>
                  <td className="px-4 py-3">{fir.petitionerName}</td>
                  <td className="px-4 py-3">{fir.branch}</td>
                  <td className="px-4 py-3 capitalize">{formatStatusLabel(fir.status)}</td>
                  <td className="px-4 py-3">{formatDate(fir.dateOfFiling)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canShowMore && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 20)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Show more
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {label}
      <input
        type="text"
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </label>
  )
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

