import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createProceeding, fetchAllProceedings, fetchFIRs, searchFIRs } from '../lib/api'
import { useAuthStore } from '../store'
import type { FIR, Proceeding, ProceedingType, CourtAttendanceMode, WritStatus, CreateProceedingInput } from '../types'

export default function Proceedings() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.currentUser)
  const [proceedings, setProceedings] = useState<Proceeding[]>([])
  const [firs, setFirs] = useState<FIR[]>([])
  const [firSearchQuery, setFirSearchQuery] = useState('')
  const [firSearchResults, setFirSearchResults] = useState<FIR[]>([])
  const [isSearchingFir, setIsSearchingFir] = useState(false)
  const [showFirDropdown, setShowFirDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<ProceedingType | 'ALL'>('ALL')
  const [filterFIR, setFilterFIR] = useState<string>('ALL')

  const [formData, setFormData] = useState({
    fir: '',
    type: 'NOTICE_OF_MOTION' as ProceedingType,
    summary: '',
    details: '',
    hearingDetails: {
      dateOfHearing: '',
      judgeName: '',
      courtNumber: '',
    },
    noticeOfMotion: {
      attendanceMode: 'BY_FORMAT' as CourtAttendanceMode,
      formatSubmitted: false,
      formatFilledBy: { name: '', rank: '', mobile: '' },
      appearingAG: { name: '', rank: '', mobile: '' },
      attendingOfficer: { name: '', rank: '', mobile: '' },
      nextDateOfHearing: '',
      officerDeputedForReply: '',
      vettingOfficerDetails: '',
      replyFiled: false,
      replyFilingDate: '',
      advocateGeneralName: '',
      investigatingOfficerName: '',
      replyScrutinizedByHC: false,
    },
    replyTracking: {
      proceedingInCourt: '',
      orderInShort: '',
      nextActionablePoint: '',
      nextDateOfHearing: '',
    },
    argumentDetails: {
      nextDateOfHearing: '',
    },
    decisionDetails: {
      writStatus: 'PENDING' as WritStatus,
      remarks: '',
      decisionByCourt: '',
      dateOfDecision: '',
    },
  })

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        console.log('Loading FIRs and proceedings...')
        const [proceedingsData, firsData] = await Promise.all([
          fetchAllProceedings(),
          fetchFIRs(),
        ])
        console.log('FIRs loaded:', firsData?.length || 0, firsData)
        console.log('Proceedings loaded:', proceedingsData?.length || 0)
        setProceedings(proceedingsData || [])
        setFirs(firsData || [])
        setFirSearchResults(firsData || []) // Initialize search results with all FIRs
        setError(null)
      } catch (err) {
        console.error('Error loading data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load proceedings')
        // Set empty arrays to prevent dropdown issues
        setFirs([])
        setFirSearchResults([])
        setProceedings([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Search FIRs when query changes
  useEffect(() => {
    const searchDelay = setTimeout(async () => {
      if (firSearchQuery.trim() === '') {
        setFirSearchResults(firs)
        setIsSearchingFir(false)
        return
      }

      try {
        setIsSearchingFir(true)
        console.log('Searching FIRs with query:', firSearchQuery)
        const results = await searchFIRs(firSearchQuery)
        console.log('Search results:', results?.length || 0, results)
        setFirSearchResults(results || [])
      } catch (err) {
        console.error('Failed to search FIRs:', err)
        setFirSearchResults([])
        // Don't show error to user for search, just log it
      } finally {
        setIsSearchingFir(false)
      }
    }, 300) // Debounce search by 300ms

    return () => clearTimeout(searchDelay)
  }, [firSearchQuery, firs])

  const upcomingHearings = useMemo(() => {
    const now = new Date()
    const latestByFIR = new Map<string, Proceeding>()

    proceedings.forEach((p) => {
      const firId =
        typeof p.fir === 'string'
          ? p.fir
          : p.fir?._id
      if (!firId) return

      const existing = latestByFIR.get(firId)
      const currentSeq = existing?.sequence ?? -Infinity
      const seq = p.sequence ?? -Infinity

      if (!existing || seq > currentSeq) {
        latestByFIR.set(firId, p)
      } else if (seq === currentSeq) {
        const currentTime = new Date(existing?.createdAt || 0).getTime()
        const newTime = new Date(p.createdAt || 0).getTime()
        if (newTime > currentTime) {
          latestByFIR.set(firId, p)
        }
      }
    })

    return Array.from(latestByFIR.values())
      .filter((p) => {
        const hearingDate = p.hearingDetails?.dateOfHearing
        if (!hearingDate) return false
        return new Date(hearingDate) >= now
      })
      .sort((a, b) => {
        const dateA = new Date(a.hearingDetails?.dateOfHearing || 0).getTime()
        const dateB = new Date(b.hearingDetails?.dateOfHearing || 0).getTime()
        return dateA - dateB
      })
      .slice(0, 10)
  }, [proceedings])

  const filteredProceedings = useMemo(() => {
    let filtered = proceedings

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter((p) => {
        const fir = typeof p.fir === 'object' ? p.fir : null
        return (
          p.summary?.toLowerCase().includes(term) ||
          p.hearingDetails?.judgeName?.toLowerCase().includes(term) ||
          p.hearingDetails?.courtNumber?.toLowerCase().includes(term) ||
          fir?.firNumber?.toLowerCase().includes(term) ||
          fir?.petitionerName?.toLowerCase().includes(term)
        )
      })
    }

    if (filterType !== 'ALL') {
      filtered = filtered.filter((p) => p.type === filterType)
    }

    if (filterFIR !== 'ALL') {
      filtered = filtered.filter((p) => {
        const firId = typeof p.fir === 'object' ? p.fir._id : p.fir
        return firId === filterFIR
      })
    }

    return filtered.sort((a, b) => {
      const dateA = new Date(a.hearingDetails?.dateOfHearing || a.createdAt || 0).getTime()
      const dateB = new Date(b.hearingDetails?.dateOfHearing || b.createdAt || 0).getTime()
      return dateB - dateA
    })
  }, [proceedings, searchTerm, filterType, filterFIR])

  const stats = useMemo(() => {
    const now = new Date()
    const upcoming = proceedings.filter(
      (p) => p.hearingDetails?.dateOfHearing && new Date(p.hearingDetails.dateOfHearing) >= now
    ).length

    const byType = proceedings.reduce(
      (acc, p) => {
        acc[p.type] = (acc[p.type] || 0) + 1
        return acc
      },
      {} as Record<ProceedingType, number>
    )

    return {
      total: proceedings.length,
      upcoming,
      byType,
    }
  }, [proceedings])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formData.fir || !formData.hearingDetails.dateOfHearing) {
      setError('Please fill in required fields (FIR and Hearing Date)')
      return
    }

    if (!user?.token) {
      setError('Authentication required')
      return
    }

    try {
      setError(null)
      const payload: CreateProceedingInput = {
        fir: formData.fir,
        type: formData.type,
        summary: formData.summary || undefined,
        details: formData.details || undefined,
        hearingDetails: formData.hearingDetails,
      }

      if (formData.type === 'NOTICE_OF_MOTION') {
        payload.noticeOfMotion = formData.noticeOfMotion
      } else if (formData.type === 'TO_FILE_REPLY') {
        // TO_FILE_REPLY uses both noticeOfMotion (for officer/AG fields) and replyTracking (for court details)
        payload.noticeOfMotion = formData.noticeOfMotion
        payload.replyTracking = formData.replyTracking
      } else if (formData.type === 'ARGUMENT') {
        payload.argumentDetails = formData.argumentDetails
      } else if (formData.type === 'DECISION') {
        payload.decisionDetails = formData.decisionDetails
      }

      // Remove createdBy from payload - backend will set it from auth context
      delete payload.createdBy

      const newProceeding = await createProceeding(payload)
      setProceedings((prev) => [newProceeding, ...prev])
      setShowCreateForm(false)
      
      // Reset form
      setFormData({
        fir: '',
        type: 'NOTICE_OF_MOTION',
        summary: '',
        details: '',
        hearingDetails: {
          dateOfHearing: '',
          judgeName: '',
          courtNumber: '',
        },
        noticeOfMotion: {
          attendanceMode: 'BY_FORMAT',
          formatSubmitted: false,
          formatFilledBy: { name: '', rank: '', mobile: '' },
          appearingAG: { name: '', rank: '', mobile: '' },
          attendingOfficer: { name: '', rank: '', mobile: '' },
          nextDateOfHearing: '',
          officerDeputedForReply: '',
          vettingOfficerDetails: '',
          replyFiled: false,
          replyFilingDate: '',
          advocateGeneralName: '',
          investigatingOfficerName: '',
          replyScrutinizedByHC: false,
        },
        replyTracking: {
          proceedingInCourt: '',
          orderInShort: '',
          nextActionablePoint: '',
          nextDateOfHearing: '',
        },
        argumentDetails: {
          nextDateOfHearing: '',
        },
        decisionDetails: {
          writStatus: 'PENDING',
          remarks: '',
          decisionByCourt: '',
          dateOfDecision: '',
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create proceeding')
    }
  }

  function getFIRDetails(proceeding: Proceeding): FIR | null {
    const fir = proceeding.fir
    return typeof fir === 'object' ? fir : firs.find((f) => f._id === fir) || null
  }

  function getDaysUntil(dateStr: string): number {
    const date = new Date(dateStr)
    const now = new Date()
    const diffTime = date.getTime() - now.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Proceedings Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track hearings, motions, and decisions across all FIR cases
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {showCreateForm ? 'Cancel' : '+ Record New Proceeding'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          label="Total Proceedings"
          value={stats.total}
          loading={loading}
          icon="📋"
          color="indigo"
        />
        <StatCard
          label="Upcoming Hearings"
          value={stats.upcoming}
          loading={loading}
          icon="📅"
          color="emerald"
        />
        <StatCard
          label="Motions"
          value={stats.byType.NOTICE_OF_MOTION || 0}
          loading={loading}
          icon="⚖️"
          color="amber"
        />
        <StatCard
          label="Decisions"
          value={stats.byType.DECISION || 0}
          loading={loading}
          icon="✅"
          color="purple"
        />
      </div>

      {/* Upcoming Hearings Section */}
      {upcomingHearings.length > 0 && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            🔔 Upcoming Court Hearings ({upcomingHearings.length})
          </h2>
          <div className="space-y-3">
            {upcomingHearings.map((proceeding) => {
              const fir = getFIRDetails(proceeding)
              const daysUntil = proceeding.hearingDetails?.dateOfHearing
                ? getDaysUntil(proceeding.hearingDetails.dateOfHearing)
                : null
              const isUrgent = daysUntil !== null && daysUntil <= 7

              return (
                <div
                  key={proceeding._id}
                  className={`rounded-lg border p-4 transition hover:shadow-md ${
                    isUrgent ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          {PROCEEDING_TYPE_LABEL[proceeding.type]}
                        </span>
                        {isUrgent && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            ⚠️ Urgent
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1 font-medium text-gray-900">
                        {fir ? (
                          <Link
                            to={`/firs/${fir._id}`}
                            className="hover:text-indigo-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            FIR #{fir.firNumber} - {fir.petitionerName}
                          </Link>
                        ) : (
                          proceeding.summary || 'No summary'
                        )}
                      </h3>
                      {proceeding.summary && fir && (
                        <p className="mt-1 text-sm text-gray-600">{proceeding.summary}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>
                          📅 {formatDate(proceeding.hearingDetails?.dateOfHearing || proceeding.createdAt)}
                        </span>
                        {proceeding.hearingDetails?.judgeName && (
                          <span>👨‍⚖️ {proceeding.hearingDetails.judgeName}</span>
                        )}
                        {proceeding.hearingDetails?.courtNumber && (
                          <span>🏛️ Court {proceeding.hearingDetails.courtNumber}</span>
                        )}
                        {daysUntil !== null && (
                          <span className={isUrgent ? 'font-semibold text-amber-700' : ''}>
                            {daysUntil === 0
                              ? 'Today'
                              : daysUntil === 1
                              ? 'Tomorrow'
                              : `${daysUntil} days away`}
                          </span>
                        )}
                      </div>
                    </div>
                    {fir && (
                      <button
                        type="button"
                        onClick={() => navigate(`/firs/${fir._id}`)}
                        className="rounded-md border border-indigo-600 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      >
                        View FIR
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Create Proceeding Form */}
      {showCreateForm && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-indigo-600">Proceedings & Decision Details</h2>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              BACK
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 0: FIR Selection */}
            <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/30 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">FIR Selection</h3>
              <div className="space-y-4">
                {/* Traditional Dropdown */}
                <label className="block text-sm font-medium text-gray-700">
                  Select FIR <span className="text-red-500">*</span>
                  {loading ? (
                    <div className="mt-1 text-sm text-gray-500">Loading FIRs...</div>
                  ) : firs.length === 0 ? (
                    <div className="mt-1 rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                      No FIRs found. Please create a FIR first.
                    </div>
                  ) : (
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 bg-white focus:border-indigo-500 focus:ring-indigo-500"
                      value={formData.fir}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, fir: e.target.value }))
                        const selectedFir = firs.find((f) => f._id === e.target.value)
                        if (selectedFir) {
                          setFirSearchQuery(`${selectedFir.firNumber} - ${selectedFir.petitionerName}`)
                        }
                      }}
                      required
                    >
                      <option value="">-- Select a FIR --</option>
                      {firs.map((fir) => (
                        <option key={fir._id} value={fir._id}>
                          {fir.firNumber} - {fir.petitionerName} ({fir.branch})
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-indigo-50/30 px-2 text-gray-500">OR</span>
                  </div>
                </div>

                {/* Search Input */}
                <label className="block text-sm font-medium text-gray-700">
                  Search FIR
                  <div className="mt-1 relative">
                    <input
                      type="text"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:border-indigo-500 focus:ring-indigo-500"
                      placeholder="Search by FIR number, petitioner name, investigating officer, or branch..."
                      value={firSearchQuery}
                      onChange={(e) => {
                        setFirSearchQuery(e.target.value)
                        setShowFirDropdown(true)
                        // If user clears search, reset selection
                        if (e.target.value === '') {
                          setFormData((prev) => ({ ...prev, fir: '' }))
                        }
                      }}
                      onFocus={() => setShowFirDropdown(true)}
                      onBlur={() => setTimeout(() => setShowFirDropdown(false), 200)}
                    />
                    {isSearchingFir && (
                      <div className="absolute right-3 top-2.5">
                        <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    )}
                    {showFirDropdown && firSearchResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                        {firSearchResults.map((fir) => (
                          <button
                            key={fir._id}
                            type="button"
                            className="w-full text-left px-4 py-2 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                            onClick={() => {
                              setFormData((prev) => ({ ...prev, fir: fir._id }))
                              setFirSearchQuery(`${fir.firNumber} - ${fir.petitionerName}`)
                              setShowFirDropdown(false)
                            }}
                          >
                            <div className="font-medium text-gray-900">{fir.firNumber}</div>
                            <div className="text-sm text-gray-600">{fir.petitionerName}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              IO: {fir.investigatingOfficer} | Branch: {fir.branch}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {showFirDropdown && !isSearchingFir && firSearchResults.length === 0 && firSearchQuery.trim() !== '' && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg p-4 text-center text-sm text-gray-500">
                        No FIRs found matching "{firSearchQuery}"
                      </div>
                    )}
                  </div>
                </label>

                {/* Selected FIR Display */}
                {formData.fir && (
                  <div className="rounded-md bg-green-50 border border-green-200 p-3">
                    <div className="text-sm font-medium text-green-800">Selected FIR:</div>
                    <div className="text-sm text-green-700 mt-1">
                      {(() => {
                        const selectedFir = firs.find((f) => f._id === formData.fir) || 
                          firSearchResults.find((f) => f._id === formData.fir)
                        return selectedFir ? `${selectedFir.firNumber} - ${selectedFir.petitionerName} (${selectedFir.branch})` : 'Loading...'
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 1: Hearing Details */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Hearing Details</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-medium text-gray-700">
                  Date of Hearing <span className="text-red-500">*</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.hearingDetails.dateOfHearing}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        hearingDetails: { ...prev.hearingDetails, dateOfHearing: e.target.value },
                      }))
                    }
                    required
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Name of Judge
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.hearingDetails.judgeName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        hearingDetails: { ...prev.hearingDetails, judgeName: e.target.value },
                      }))
                    }
                    placeholder="Justice..."
                  />
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Court Number
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.hearingDetails.courtNumber}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        hearingDetails: { ...prev.hearingDetails, courtNumber: e.target.value },
                      }))
                    }
                    placeholder="Court #"
                  />
                </label>

                <label className="md:col-span-3 text-sm font-medium text-gray-700">
                  <span className="text-red-500">*</span> Type of Proceeding
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.type}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, type: e.target.value as ProceedingType }))
                    }
                    required
                  >
                    {PROCEEDING_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

              </div>
            </div>

            {/* Section 2: Type of Proceeding */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Type of Proceeding</h3>

              {formData.type === 'NOTICE_OF_MOTION' && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">Notice of Motion Entry</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="md:col-span-2 text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> How Court is attended (Dropdown)
                      <select
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.attendanceMode}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              attendanceMode: e.target.value as CourtAttendanceMode,
                            },
                          }))
                        }
                        required
                      >
                        <option value="BY_FORMAT">By Format</option>
                        <option value="BY_PERSON">By Person</option>
                      </select>
                    </label>

                    {formData.noticeOfMotion.attendanceMode === 'BY_FORMAT' && (
                      <>
                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          <span className="text-red-500">*</span> Format Submitted
                          <select
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            value={formData.noticeOfMotion.formatSubmitted ? 'true' : 'false'}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                noticeOfMotion: {
                                  ...prev.noticeOfMotion,
                                  formatSubmitted: e.target.value === 'true',
                                },
                              }))
                            }
                            required
                          >
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </label>

                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          <span className="text-red-500">*</span> Details of Officer who filled format
                          <div className="mt-1 grid gap-2 md:grid-cols-3">
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Name *"
                              value={formData.noticeOfMotion.formatFilledBy.name}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    formatFilledBy: {
                                      ...prev.noticeOfMotion.formatFilledBy,
                                      name: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Rank *"
                              value={formData.noticeOfMotion.formatFilledBy.rank}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    formatFilledBy: {
                                      ...prev.noticeOfMotion.formatFilledBy,
                                      rank: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Mobile *"
                              value={formData.noticeOfMotion.formatFilledBy.mobile}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    formatFilledBy: {
                                      ...prev.noticeOfMotion.formatFilledBy,
                                      mobile: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                          </div>
                        </label>
                      </>
                    )}

                    {formData.noticeOfMotion.attendanceMode === 'BY_PERSON' && (
                      <>
                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          <span className="text-red-500">*</span> Details of AG who is appearing
                          <div className="mt-1 grid gap-2 md:grid-cols-3">
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Name *"
                              value={formData.noticeOfMotion.appearingAG.name}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    appearingAG: {
                                      ...prev.noticeOfMotion.appearingAG,
                                      name: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Rank *"
                              value={formData.noticeOfMotion.appearingAG.rank}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    appearingAG: {
                                      ...prev.noticeOfMotion.appearingAG,
                                      rank: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Mobile *"
                              value={formData.noticeOfMotion.appearingAG.mobile}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    appearingAG: {
                                      ...prev.noticeOfMotion.appearingAG,
                                      mobile: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                          </div>
                        </label>

                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          <span className="text-red-500">*</span> Details of Officer who is attending
                          <div className="mt-1 grid gap-2 md:grid-cols-3">
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Name *"
                              value={formData.noticeOfMotion.attendingOfficer.name}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    attendingOfficer: {
                                      ...prev.noticeOfMotion.attendingOfficer,
                                      name: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Rank *"
                              value={formData.noticeOfMotion.attendingOfficer.rank}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    attendingOfficer: {
                                      ...prev.noticeOfMotion.attendingOfficer,
                                      rank: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Mobile *"
                              value={formData.noticeOfMotion.attendingOfficer.mobile}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  noticeOfMotion: {
                                    ...prev.noticeOfMotion,
                                    attendingOfficer: {
                                      ...prev.noticeOfMotion.attendingOfficer,
                                      mobile: e.target.value,
                                    },
                                  },
                                }))
                              }
                              required
                            />
                          </div>
                        </label>
                      </>
                    )}

                    <div className="md:col-span-2 mt-2">
                      <button
                        type="button"
                        className="rounded-md border-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                      >
                        + ADD ANOTHER NOTICE OF MOTION ENTRY
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {formData.type === 'TO_FILE_REPLY' && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">To File Reply Entry</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Officer deputed for file reply
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.officerDeputedForReply}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              officerDeputedForReply: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Name of AG who will vet
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.advocateGeneralName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              advocateGeneralName: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> If reply was filed
                      <select
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.replyFiled ? 'true' : 'false'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              replyFiled: e.target.value === 'true',
                            },
                          }))
                        }
                        required
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Name of AAG/DG who will vet
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.vettingOfficerDetails}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              vettingOfficerDetails: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Name of IO who will appear
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.investigatingOfficerName}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              investigatingOfficerName: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Whether reply was scrutinized by HC
                      <select
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.noticeOfMotion.replyScrutinizedByHC ? 'true' : 'false'}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            noticeOfMotion: {
                              ...prev.noticeOfMotion,
                              replyScrutinizedByHC: e.target.value === 'true',
                            },
                          }))
                        }
                        required
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </label>

                    <label className="md:col-span-2 text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Proceeding in court
                      <textarea
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        rows={2}
                        value={formData.replyTracking.proceedingInCourt}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            replyTracking: {
                              ...prev.replyTracking,
                              proceedingInCourt: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Order in short
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.replyTracking.orderInShort}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            replyTracking: {
                              ...prev.replyTracking,
                              orderInShort: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Next Date of Hearing
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.replyTracking.nextDateOfHearing}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            replyTracking: {
                              ...prev.replyTracking,
                              nextDateOfHearing: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <label className="md:col-span-2 text-sm font-medium text-gray-700">
                      <span className="text-red-500">*</span> Next actionable point
                      <textarea
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        rows={2}
                        value={formData.replyTracking.nextActionablePoint}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            replyTracking: {
                              ...prev.replyTracking,
                              nextActionablePoint: e.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </label>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        className="mb-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        <span className="mr-2">☁️</span> UPLOAD ORDER OF PROCEEDING
                      </button>
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        className="rounded-md border-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                      >
                        + ADD ANOTHER TO FILE REPLY ENTRY
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {formData.type === 'ARGUMENT' && (
                <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                  <h4 className="mb-3 text-sm font-semibold text-gray-700">Argument Entry</h4>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-gray-700">
                      Next Date of Hearing
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={formData.argumentDetails.nextDateOfHearing}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            argumentDetails: {
                              ...prev.argumentDetails,
                              nextDateOfHearing: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Decision Details */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Decision Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  <span className="text-red-500">*</span> Writ status
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.decisionDetails.writStatus}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        decisionDetails: {
                          ...prev.decisionDetails,
                          writStatus: e.target.value as WritStatus,
                        },
                      }))
                    }
                    required
                  >
                    {WritStatusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-gray-700">
                  Date of Decision
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.decisionDetails.dateOfDecision}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        decisionDetails: {
                          ...prev.decisionDetails,
                          dateOfDecision: e.target.value,
                        },
                      }))
                    }
                  />
                </label>

                <label className="md:col-span-2 text-sm font-medium text-gray-700">
                  Decision by Court
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.decisionDetails.decisionByCourt}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        decisionDetails: {
                          ...prev.decisionDetails,
                          decisionByCourt: e.target.value,
                        },
                      }))
                    }
                  />
                </label>

                <label className="md:col-span-2 text-sm font-medium text-gray-700">
                  Remarks
                  <textarea
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    rows={3}
                    value={formData.decisionDetails.remarks}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        decisionDetails: {
                          ...prev.decisionDetails,
                          remarks: e.target.value,
                        },
                      }))
                    }
                  />
                </label>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    <span className="mr-2">☁️</span> UPLOAD ORDER OF PROCEEDING
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                BACK
              </button>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                FINAL SUBMIT
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filters and Search */}
      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">All Proceedings</h2>
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Search by FIR, judge, court..."
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ProceedingType | 'ALL')}
            >
              <option value="ALL">All Types</option>
              {PROCEEDING_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={filterFIR}
              onChange={(e) => setFilterFIR(e.target.value)}
            >
              <option value="ALL">All FIRs</option>
              {firs.map((fir) => (
                <option key={fir._id} value={fir._id}>
                  {fir.firNumber}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredProceedings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
            {loading ? 'Loading proceedings...' : 'No proceedings found matching your filters.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProceedings.slice(0, 20).map((proceeding) => {
              const fir = getFIRDetails(proceeding)
              return (
                <div
                  key={proceeding._id}
                  className="cursor-pointer rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50 hover:shadow-sm"
                  onClick={() => fir && navigate(`/firs/${fir._id}`)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          #{proceeding.sequence || '—'}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                          {PROCEEDING_TYPE_LABEL[proceeding.type]}
                        </span>
                      </div>
                      <h3 className="mt-1 font-medium text-gray-900">
                        {fir ? `FIR #${fir.firNumber} - ${fir.petitionerName}` : 'Unknown FIR'}
                      </h3>
                      {proceeding.summary && (
                        <p className="mt-1 text-sm text-gray-600">{proceeding.summary}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>
                          📅 {formatDate(proceeding.hearingDetails?.dateOfHearing || proceeding.createdAt)}
                        </span>
                        {proceeding.hearingDetails?.judgeName && (
                          <span>👨‍⚖️ {proceeding.hearingDetails.judgeName}</span>
                        )}
                        {proceeding.hearingDetails?.courtNumber && (
                          <span>🏛️ Court {proceeding.hearingDetails.courtNumber}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {filteredProceedings.length > 20 && (
              <div className="pt-2 text-center text-sm text-gray-500">
                Showing 20 of {filteredProceedings.length} proceedings
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function StatCard({
  label,
  value,
  loading,
  icon,
  color = 'indigo',
}: {
  label: string
  value: number
  loading?: boolean
  icon?: string
  color?: 'indigo' | 'emerald' | 'amber' | 'purple'
}) {
  const colorClasses = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    amber: 'bg-amber-50 text-amber-600 border-amber-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  }

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-75">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{loading ? '—' : value}</div>
        </div>
        {icon && <div className="text-2xl">{icon}</div>}
      </div>
    </div>
  )
}

const PROCEEDING_TYPE_LABEL: Record<ProceedingType, string> = {
  NOTICE_OF_MOTION: 'Notice of Motion',
  TO_FILE_REPLY: 'Reply Tracking',
  ARGUMENT: 'Argument',
  DECISION: 'Decision',
}

const PROCEEDING_TYPE_OPTIONS = [
  { value: 'NOTICE_OF_MOTION', label: 'Notice of Motion' },
  { value: 'TO_FILE_REPLY', label: 'Reply Tracking' },
  { value: 'ARGUMENT', label: 'Argument' },
  { value: 'DECISION', label: 'Decision' },
]

const WritStatusOptions = [
  { value: 'ALLOWED', label: 'Allowed' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
  { value: 'DIRECTION', label: 'Direction' },
]

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
