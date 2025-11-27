import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createProceeding, fetchFIRDetail, fetchProceedingsByFIR } from '../lib/api'
import { useAuthStore, useApiCacheStore } from '../store'
import type { FIR, Proceeding, ProceedingType, CourtAttendanceMode, WritStatus, CreateProceedingInput, NoticeOfMotionDetails } from '../types'

export default function FIRDetail() {
  const { firId } = useParams<{ firId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.currentUser)
  const [fir, setFir] = useState<FIR | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localProceedings, setLocalProceedings] = useState<Proceeding[]>([])
  const [showForm, setShowForm] = useState(false)
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
    noticeOfMotion: [{
      attendanceMode: 'BY_FORMAT' as CourtAttendanceMode,
      formatSubmitted: false,
      formatFilledBy: { name: '', rank: '', mobile: '' },
      appearingAG: { name: '', rank: '', mobile: '' },
      attendingOfficer: { name: '', rank: '', mobile: '' },
      investigatingOfficer: { name: '', rank: '', mobile: '' },
      nextDateOfHearing: '',
      officerDeputedForReply: '',
      vettingOfficerDetails: '',
      replyFiled: false,
      replyFilingDate: '',
      advocateGeneralName: '',
      replyScrutinizedByHC: false,
    }] as NoticeOfMotionDetails[],
    replyTracking: {
      proceedingInCourt: '',
      orderInShort: '',
      nextActionablePoint: '',
      nextDateOfHearing: '',
    },
    argumentDetails: {
      details: '',
      nextDateOfHearing: '',
    },
    decisionDetails: {
      writStatus: 'PENDING' as WritStatus,
      remarks: '',
      decisionByCourt: '',
      dateOfDecision: '',
    },
  })
  const [orderOfProceedingFile, setOrderOfProceedingFile] = useState<File | null>(null)

  const formatDateInputValue = (value: string | Date | null | undefined): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }
    return date.toISOString().split('T')[0]
  }

  useEffect(() => {
    async function load() {
      if (!firId) {
        setError('Missing FIR identifier')
        setLoading(false)
        return
      }
      try {
        const cache = useApiCacheStore.getState()
        
        // Check cache first for instant loading
        const cachedFIR = cache.getCachedFIRDetail(firId)
        const cachedProceedings = cache.getCachedProceedingsByFIR(firId)

        if (cachedFIR) {
          setFir(cachedFIR)
          setLoading(false) // Show cached data immediately
        }
        if (cachedProceedings) {
          setLocalProceedings(cachedProceedings)
        }

        // Fetch fresh data in the background
        setLoading(true)
        const [data, proceedingsData] = await Promise.all([
          fetchFIRDetail(firId),
          fetchProceedingsByFIR(firId),
        ])
        setFir(data)
        setLocalProceedings(proceedingsData || [])
        // Pre-select the FIR in the form
        setFormData((prev) => ({
          ...prev,
          fir: firId,
        }))
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load FIR')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [firId])

  const sortedProceedings = useMemo(() => {
    return [...localProceedings].sort((a, b) => {
      const seqA = a.sequence ?? 0
      const seqB = b.sequence ?? 0
      if (seqA === seqB) {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      }
      return seqB - seqA
    })
  }, [localProceedings])

  function addNoticeOfMotionEntry() {
    setFormData((prev) => ({
      ...prev,
      noticeOfMotion: [
        ...prev.noticeOfMotion,
        {
          attendanceMode: 'BY_FORMAT' as CourtAttendanceMode,
          formatSubmitted: false,
          formatFilledBy: { name: '', rank: '', mobile: '' },
          appearingAG: { name: '', rank: '', mobile: '' },
          attendingOfficer: { name: '', rank: '', mobile: '' },
          investigatingOfficer: { name: '', rank: '', mobile: '' },
          nextDateOfHearing: '',
          officerDeputedForReply: '',
          vettingOfficerDetails: '',
          replyFiled: false,
          replyFilingDate: '',
          advocateGeneralName: '',
          replyScrutinizedByHC: false,
        },
      ],
    }))
  }

  function removeNoticeOfMotionEntry(index: number) {
    setFormData((prev) => ({
      ...prev,
      noticeOfMotion: prev.noticeOfMotion.filter((_, i) => i !== index),
    }))
  }

  function updateNoticeOfMotionEntry(index: number, field: keyof NoticeOfMotionDetails, value: any) {
    setFormData((prev) => {
      const updated = [...prev.noticeOfMotion]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, noticeOfMotion: updated }
    })
  }

  function updateNoticeOfMotionPerson(index: number, personType: 'formatFilledBy' | 'appearingAG' | 'attendingOfficer' | 'investigatingOfficer', field: 'name' | 'rank' | 'mobile', value: string) {
    setFormData((prev) => {
      const updated = [...prev.noticeOfMotion]
      updated[index] = {
        ...updated[index],
        [personType]: {
          ...(updated[index][personType] || { name: '', rank: '', mobile: '' }),
          [field]: value,
        },
      }
      return { ...prev, noticeOfMotion: updated }
    })
  }

  async function handleProceedingSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formData.fir || !formData.hearingDetails.dateOfHearing) {
      setError('Please fill in required fields (Hearing Date)')
      return
    }

    if (!user?.token) {
      setError('Authentication required')
      return
    }

    if (!firId) {
      setError('FIR ID is missing')
      return
    }

    try {
      setError(null)

      // Validate file if present
      if (orderOfProceedingFile) {
        if (orderOfProceedingFile.size > 250 * 1024) {
          setError('File size exceeds 250 KB limit')
          return
        }
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
        if (!allowedTypes.includes(orderOfProceedingFile.type)) {
          setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
          return
        }
      }

      const payload: CreateProceedingInput = {
        fir: firId,
        type: formData.type,
        summary: formData.summary || undefined,
        details: formData.details || undefined,
        hearingDetails: formData.hearingDetails,
      }

      if (formData.type === 'NOTICE_OF_MOTION') {
        payload.noticeOfMotion = formData.noticeOfMotion.length === 1 ? formData.noticeOfMotion[0] : formData.noticeOfMotion
      } else if (formData.type === 'TO_FILE_REPLY') {
        payload.noticeOfMotion = formData.noticeOfMotion.length === 1 ? formData.noticeOfMotion[0] : formData.noticeOfMotion
        payload.replyTracking = formData.replyTracking
      } else if (formData.type === 'ARGUMENT') {
        payload.argumentDetails = formData.argumentDetails
      } else if (formData.type === 'DECISION') {
        payload.decisionDetails = formData.decisionDetails
      }

      // Remove createdBy from payload - backend will set it from auth context
      delete payload.createdBy

      const newProceeding = await createProceeding(payload, orderOfProceedingFile || undefined)
      setLocalProceedings((prev) => [newProceeding, ...prev])
      setShowForm(false)
      setOrderOfProceedingFile(null)
      
      // Reset form but keep FIR selected
      setFormData({
        fir: firId,
        type: 'NOTICE_OF_MOTION',
        summary: '',
        details: '',
        hearingDetails: {
          dateOfHearing: '',
          judgeName: '',
          courtNumber: '',
        },
        noticeOfMotion: [{
          attendanceMode: 'BY_FORMAT',
          formatSubmitted: false,
          formatFilledBy: { name: '', rank: '', mobile: '' },
          appearingAG: { name: '', rank: '', mobile: '' },
          attendingOfficer: { name: '', rank: '', mobile: '' },
          investigatingOfficer: { name: '', rank: '', mobile: '' },
          nextDateOfHearing: '',
          officerDeputedForReply: '',
          vettingOfficerDetails: '',
          replyFiled: false,
          replyFilingDate: '',
          advocateGeneralName: '',
          replyScrutinizedByHC: false,
        }],
        replyTracking: {
          proceedingInCourt: '',
          orderInShort: '',
          nextActionablePoint: '',
          nextDateOfHearing: '',
        },
        argumentDetails: {
          details: '',
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

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-gray-500">
        Loading FIR profile…
      </div>
    )
  }

  if (error || !fir) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error || 'Unable to locate FIR'}
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          Go Back
        </button>
      </div>
    )
  }

  const respondentEntries =
    (fir.respondents || []).map((res) =>
      typeof res === 'string' ? { name: res, designation: '—' } : res
    )

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/firs" className="text-sm font-medium text-indigo-600 hover:underline">
            ← Back to FIRs
          </Link>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">
            {formatWritType(fir.writType)} Writ · WRIT #{fir.firNumber}
          </h1>
          <p className="text-sm text-gray-500">
            Filed on {formatDate(fir.dateOfFIR || fir.dateOfFiling)} ·{' '}
            {fir.branchName || fir.branch} · Police Station {fir.policeStation}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={fir.status} />
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? 'Close Proceeding Form' : 'Record New Proceeding'}
          </button>
        </div>
      </div>

      {!showForm && (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <ProfileCard title="Investigating Officers">
          {(fir.investigatingOfficers && fir.investigatingOfficers.length > 0) ? (
            <div className="space-y-4">
              {fir.investigatingOfficers.map((io, idx) => (
                <div key={idx} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Officer {idx + 1}
                  </div>
                  <ProfileRow label="Name">{io.name || '—'}</ProfileRow>
                  <ProfileRow label="Rank">{io.rank || '—'}</ProfileRow>
                  <ProfileRow label="Posting">{io.posting || '—'}</ProfileRow>
                  <ProfileRow label="Contact">{io.contact || '—'}</ProfileRow>
                  {(io.from || io.to) && (
                    <ProfileRow label="Tenure">
                      <span>
                        {formatDate(io.from || undefined)} – {formatDate(io.to || undefined)}
                      </span>
                    </ProfileRow>
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Fallback to legacy fields for backward compatibility
            <>
              <ProfileRow label="Officer">{fir.investigatingOfficer || '—'}</ProfileRow>
              <ProfileRow label="Rank">{fir.investigatingOfficerRank || '—'}</ProfileRow>
              <ProfileRow label="Posting">{fir.investigatingOfficerPosting || '—'}</ProfileRow>
              <ProfileRow label="Contact">{fir.investigatingOfficerContact || '—'}</ProfileRow>
              <ProfileRow label="Tenure">
                {fir.investigatingOfficerFrom || fir.investigatingOfficerTo ? (
                  <span>
                    {formatDate(fir.investigatingOfficerFrom || undefined)} – {formatDate(fir.investigatingOfficerTo || undefined)}
                  </span>
                ) : (
                  '—'
                )}
              </ProfileRow>
            </>
          )}
        </ProfileCard>
        <ProfileCard title="Petitioner">
          <ProfileRow label="Name">{fir.petitionerName}</ProfileRow>
          <ProfileRow label="Father's Name">{fir.petitionerFatherName}</ProfileRow>
          <ProfileRow label="Address">{fir.petitionerAddress}</ProfileRow>
          <ProfileRow label="Prayer">{fir.petitionerPrayer}</ProfileRow>
        </ProfileCard>
        <ProfileCard title="Case Snapshot">
          <ProfileRow label="Branch">{fir.branchName || fir.branch}</ProfileRow>
          <ProfileRow label="Police Station">{fir.policeStation}</ProfileRow>
          <ProfileRow label="Writ Info">
            <div>
              <div className="font-medium text-gray-900">{formatWritType(fir.writType)}</div>
              <div className="text-xs text-gray-500">
                {fir.writNumber ? `#${fir.writNumber}` : '—'}
                {fir.writYear ? ` · ${fir.writYear}` : ''}
                {fir.writType === 'BAIL' && fir.writSubType
                  ? ` · ${formatStatusLabel(fir.writSubType)}`
                  : ''}
                {fir.writType === 'ANY_OTHER' && fir.writTypeOther ? ` · ${fir.writTypeOther}` : ''}
              </div>
            </div>
          </ProfileRow>
          <ProfileRow label="Under Section">
            {fir.underSection || (fir.sections || []).join(', ') || '—'}
          </ProfileRow>
          <ProfileRow label="Act">{fir.act}</ProfileRow>
          <ProfileRow label="Respondents">
            {respondentEntries.length ? (
              <ul className="list-inside list-disc space-y-1 text-sm">
                {respondentEntries.map((res, idx) => (
                  <li key={`${res.name}-${idx}`}>
                    <span className="font-medium text-gray-900">{res.name}</span>
                    <span className="text-gray-500"> · {res.designation || '—'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              '—'
            )}
          </ProfileRow>
        </ProfileCard>
      </section>

      <section className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900">Case Description</h2>
        <p className="mt-3 text-gray-700">{fir.description || 'No description available.'}</p>
      </section>

      <section className="space-y-6 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Proceeding Timeline</h2>
            <p className="text-sm text-gray-500">
              Complete history of case flow ({sortedProceedings.length} entries)
            </p>
          </div>
        </div>

        {sortedProceedings.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
            No proceedings have been recorded for this FIR yet.
          </div>
        )}

        {sortedProceedings.length > 0 && (
          <ol className="space-y-4">
            {sortedProceedings.map((item, index) => (
              <Fragment key={`${item._id}-${index}`}>
                <li className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="rounded-full border-2 border-indigo-500 bg-white px-3 py-1 text-xs font-semibold text-indigo-600">
                      {item.sequence ?? index + 1}
                    </div>
                    {index !== sortedProceedings.length - 1 && (
                      <div className="h-full w-px bg-gray-200" />
                    )}
                  </div>
                  <div className="flex-1 rounded-lg border bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-800">
                        {PROCEEDING_TYPE_LABEL[item.type] || item.type}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(item.hearingDetails?.dateOfHearing || item.createdAt)}
                      </div>
                    </div>
                    {item.summary && (
                      <p className="mt-1 text-sm font-medium text-gray-900">{item.summary}</p>
                    )}
                    {item.details && <p className="mt-1 text-sm text-gray-600">{item.details}</p>}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      {item.hearingDetails?.judgeName && (
                        <span>Judge: {item.hearingDetails.judgeName}</span>
                      )}
                      {item.hearingDetails?.courtNumber && (
                        <span>Courtroom: {item.hearingDetails.courtNumber}</span>
                      )}
                    </div>
                  </div>
                </li>
              </Fragment>
            ))}
          </ol>
        )}
      </section>
        </>
      )}

      {showForm && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-6">
            {error && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleProceedingSubmit} className="space-y-6">
              {/* Section 0: FIR Selection (Read-only, pre-selected) */}
              <div className="rounded-lg border-2 border-indigo-200 bg-green-50/50 p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Selected FIR</h3>
                <div className="rounded-md bg-green-100 border border-green-300 p-3">
                  <div className="text-sm font-medium text-green-800">
                    {fir?.firNumber} - {fir?.petitionerName} ({fir?.branchName || fir?.branch})
                  </div>
                  <div className="mt-1 text-xs text-green-700">
                    This proceeding will be associated with the current FIR
                  </div>
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
                    Name of Judge <span className="text-red-500">*</span>
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
                      required
                    />
                  </label>

                  <label className="text-sm font-medium text-gray-700">
                    Court Number <span className="text-red-500">*</span>
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
                      required
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
                  <div className="space-y-6">
                    {formData.noticeOfMotion.map((entry, index) => (
                      <div key={index} className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-700">
                            Notice of Motion Entry #{index + 1}
                          </h4>
                          {formData.noticeOfMotion.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeNoticeOfMotionEntry(index)}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="md:col-span-2 text-sm font-medium text-gray-700">
                            <span className="text-red-500">*</span> How Court is attended (Dropdown)
                            <select
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.attendanceMode}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'attendanceMode', e.target.value as CourtAttendanceMode)
                              }
                              required
                            >
                              <option value="BY_FORMAT">By Format</option>
                              <option value="BY_PERSON">By Person</option>
                            </select>
                          </label>

                          {entry.attendanceMode === 'BY_FORMAT' && (
                            <>
                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Whether format is duly filled and submitted <span className="text-red-500">*</span>
                                <select
                                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                                  value={entry.formatSubmitted ? 'true' : 'false'}
                                  onChange={(e) =>
                                    updateNoticeOfMotionEntry(index, 'formatSubmitted', e.target.value === 'true')
                                  }
                                  required
                                >
                                  <option value="false">No</option>
                                  <option value="true">Yes</option>
                                </select>
                              </label>

                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Details of officer who has filled it <span className="text-red-500">*</span>
                                <div className="mt-1 grid gap-2 md:grid-cols-3">
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Name *"
                                    value={entry.formatFilledBy?.name || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'formatFilledBy', 'name', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Rank *"
                                    value={entry.formatFilledBy?.rank || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'formatFilledBy', 'rank', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Mobile *"
                                    value={entry.formatFilledBy?.mobile || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'formatFilledBy', 'mobile', e.target.value)
                                    }
                                    required
                                  />
                                </div>
                              </label>

                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Details of AG who is appearing <span className="text-red-500">*</span>
                                <div className="mt-1 grid gap-2 md:grid-cols-3">
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Name *"
                                    value={entry.appearingAG?.name || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'appearingAG', 'name', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Rank *"
                                    value={entry.appearingAG?.rank || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'appearingAG', 'rank', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Mobile *"
                                    value={entry.appearingAG?.mobile || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'appearingAG', 'mobile', e.target.value)
                                    }
                                    required
                                  />
                                </div>
                              </label>
                            </>
                          )}

                          {entry.attendanceMode === 'BY_PERSON' && (
                            <>
                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Details of IO investigating officer <span className="text-red-500">*</span>
                                <div className="mt-1 grid gap-2 md:grid-cols-3">
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Name *"
                                    value={entry.investigatingOfficer?.name || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'investigatingOfficer', 'name', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Rank *"
                                    value={entry.investigatingOfficer?.rank || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'investigatingOfficer', 'rank', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Mobile *"
                                    value={entry.investigatingOfficer?.mobile || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'investigatingOfficer', 'mobile', e.target.value)
                                    }
                                    required
                                  />
                                </div>
                              </label>

                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Details of Officer who is attending <span className="text-red-500">*</span>
                                <div className="mt-1 grid gap-2 md:grid-cols-3">
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Name *"
                                    value={entry.attendingOfficer?.name || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'attendingOfficer', 'name', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Rank *"
                                    value={entry.attendingOfficer?.rank || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'attendingOfficer', 'rank', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Mobile *"
                                    value={entry.attendingOfficer?.mobile || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'attendingOfficer', 'mobile', e.target.value)
                                    }
                                    required
                                  />
                                </div>
                              </label>

                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Details of AG who is appearing <span className="text-red-500">*</span>
                                <div className="mt-1 grid gap-2 md:grid-cols-3">
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Name *"
                                    value={entry.appearingAG?.name || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'appearingAG', 'name', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Rank *"
                                    value={entry.appearingAG?.rank || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'appearingAG', 'rank', e.target.value)
                                    }
                                    required
                                  />
                                  <input
                                    type="text"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                    placeholder="Mobile *"
                                    value={entry.appearingAG?.mobile || ''}
                                    onChange={(e) =>
                                      updateNoticeOfMotionPerson(index, 'appearingAG', 'mobile', e.target.value)
                                    }
                                    required
                                  />
                                </div>
                              </label>
                            </>
                          )}
                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          Next date of hearing <span className="text-red-500">*</span>
                          <input
                            type="date"
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            value={formatDateInputValue(entry.nextDateOfHearing)}
                            onChange={(e) =>
                              updateNoticeOfMotionEntry(index, 'nextDateOfHearing', e.target.value)
                            }
                            required
                          />
                        </label>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        addNoticeOfMotionEntry()
                      }}
                      className="w-full rounded-md border-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                    >
                      + ADD ANOTHER NOTICE OF MOTION ENTRY
                    </button>
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
                          value={formData.noticeOfMotion[0]?.officerDeputedForReply || ''}
                          onChange={(e) =>
                            updateNoticeOfMotionEntry(0, 'officerDeputedForReply', e.target.value)
                          }
                          required
                        />
                      </label>

                      <label className="text-sm font-medium text-gray-700">
                        <span className="text-red-500">*</span> Name of AG who will vet
                        <input
                          type="text"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={formData.noticeOfMotion[0]?.advocateGeneralName || ''}
                          onChange={(e) =>
                            updateNoticeOfMotionEntry(0, 'advocateGeneralName', e.target.value)
                          }
                          required
                        />
                      </label>

                      <label className="text-sm font-medium text-gray-700">
                        <span className="text-red-500">*</span> If reply was filed
                        <select
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={formData.noticeOfMotion[0]?.replyFiled ? 'true' : 'false'}
                          onChange={(e) =>
                            updateNoticeOfMotionEntry(0, 'replyFiled', e.target.value === 'true')
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
                          value={formData.noticeOfMotion[0]?.vettingOfficerDetails || ''}
                          onChange={(e) =>
                            updateNoticeOfMotionEntry(0, 'vettingOfficerDetails', e.target.value)
                          }
                          required
                        />
                      </label>

                      <label className="text-sm font-medium text-gray-700">
                        <span className="text-red-500">*</span> Details of IO who will appear
                        <div className="mt-1 grid gap-2 md:grid-cols-3">
                          <input
                            type="text"
                            className="rounded-md border border-gray-300 px-3 py-2"
                            placeholder="Name *"
                            value={formData.noticeOfMotion[0]?.investigatingOfficer?.name || ''}
                            onChange={(e) =>
                              updateNoticeOfMotionPerson(0, 'investigatingOfficer', 'name', e.target.value)
                            }
                            required
                          />
                          <input
                            type="text"
                            className="rounded-md border border-gray-300 px-3 py-2"
                            placeholder="Rank *"
                            value={formData.noticeOfMotion[0]?.investigatingOfficer?.rank || ''}
                            onChange={(e) =>
                              updateNoticeOfMotionPerson(0, 'investigatingOfficer', 'rank', e.target.value)
                            }
                            required
                          />
                          <input
                            type="text"
                            className="rounded-md border border-gray-300 px-3 py-2"
                            placeholder="Mobile *"
                            value={formData.noticeOfMotion[0]?.investigatingOfficer?.mobile || ''}
                            onChange={(e) =>
                              updateNoticeOfMotionPerson(0, 'investigatingOfficer', 'mobile', e.target.value)
                            }
                            required
                          />
                        </div>
                      </label>

                      <label className="text-sm font-medium text-gray-700">
                        <span className="text-red-500">*</span> Whether reply was scrutinized by HC
                        <select
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={formData.noticeOfMotion[0]?.replyScrutinizedByHC ? 'true' : 'false'}
                          onChange={(e) =>
                            updateNoticeOfMotionEntry(0, 'replyScrutinizedByHC', e.target.value === 'true')
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
                      <label className="md:col-span-2 text-sm font-medium text-gray-700">
                        Argument details <span className="text-red-500">*</span>
                        <textarea
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          rows={3}
                          value={formData.argumentDetails.details}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              argumentDetails: {
                                ...prev.argumentDetails,
                                details: e.target.value,
                              },
                            }))
                          }
                          required
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Next date of hearing <span className="text-red-500">*</span>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={formatDateInputValue(formData.argumentDetails.nextDateOfHearing)}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              argumentDetails: {
                                ...prev.argumentDetails,
                                nextDateOfHearing: e.target.value,
                              },
                            }))
                          }
                          required
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
                    Writ status <span className="text-red-500 ml-1">*</span>
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
                    <label className="block text-sm font-medium text-gray-700">
                      Upload Order of Proceeding
                      <span className="ml-1 text-xs text-gray-500">(PDF, PNG, JPEG, JPG, Excel - Max 250 KB)</span>
                    </label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        id="order-of-proceeding-file-firdetail"
                        type="file"
                        accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
                        className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 250 * 1024) {
                              setError('File size exceeds 250 KB limit')
                              e.target.value = ''
                              return
                            }
                            const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                            if (!allowedTypes.includes(file.type)) {
                              setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
                              e.target.value = ''
                              return
                            }
                            setOrderOfProceedingFile(file)
                            setError(null)
                          }
                        }}
                      />
                      {orderOfProceedingFile && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span>{orderOfProceedingFile.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setOrderOfProceedingFile(null)
                              const fileInput = document.getElementById('order-of-proceeding-file-firdetail') as HTMLInputElement
                              if (fileInput) fileInput.value = ''
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
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
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR_MAP[status] || 'bg-gray-100 text-gray-700'
  const label = formatStatusLabel(status)
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{label}</span>
}

function ProfileCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <dl className="mt-3 space-y-2 text-sm text-gray-800">{children}</dl>
    </div>
  )
}

function ProfileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-gray-900">{children || '—'}</dd>
    </div>
  )
}

const STATUS_COLOR_MAP: Record<string, string> = {
  REGISTERED: 'bg-blue-100 text-blue-700',
  UNDER_INVESTIGATION: 'bg-amber-100 text-amber-700',
  ONGOING_HEARING: 'bg-purple-100 text-purple-700',
  CHARGESHEET_FILED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-gray-200 text-gray-800',
  WITHDRAWN: 'bg-rose-100 text-rose-700',
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

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatWritType(type?: FIR['writType']) {
  if (!type) return '—'
  const map: Record<string, string> = {
    BAIL: 'Bail',
    QUASHING: 'Quashing',
    DIRECTION: 'Direction',
    SUSPENSION_OF_SENTENCE: 'Suspension of Sentence',
    PAYROLL: 'Payroll',
    ANY_OTHER: 'Other',
  }
  return map[type] || formatStatusLabel(type)
}

function formatDate(value?: string | null) {
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

