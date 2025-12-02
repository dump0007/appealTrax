import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { fetchProceedingDetail, fetchProceedingsByFIR } from '../lib/api'
import { useAuthStore } from '../store'
import type { Proceeding } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000'

const PROCEEDING_TYPE_LABEL: Record<string, string> = {
  NOTICE_OF_MOTION: 'Notice of Motion',
  TO_FILE_REPLY: 'To File Reply',
  ARGUMENT: 'Argument',
  ANY_OTHER: 'Any Other',
}

const WRIT_STATUS_LABEL: Record<string, string> = {
  ALLOWED: 'Allowed',
  PENDING: 'Pending',
  DISMISSED: 'Dismissed',
  WITHDRAWN: 'Withdrawn',
  DIRECTION: 'Direction',
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getFileIcon(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'pdf') return '📄'
  if (['png', 'jpg', 'jpeg'].includes(ext || '')) return '🖼️'
  if (['xlsx', 'xls'].includes(ext || '')) return '📊'
  return '📎'
}

async function downloadFile(filename: string, displayName: string) {
  const token = useAuthStore.getState().currentUser?.token
  if (!token) {
    alert('Authentication required to download files')
    return
  }

  try {
    const response = await fetch(`${API_BASE_URL}/assets/proceedings/${filename}`, {
      headers: {
        'x-access-token': token,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to download file')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = displayName || filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  } catch (error) {
    console.error('Error downloading file:', error)
    alert('Failed to download file. Please try again.')
  }
}

export default function ProceedingDetail() {
  const { proceedingId } = useParams<{ proceedingId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  const [proceeding, setProceeding] = useState<Proceeding | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)

  // Determine navigation source
  const navigationSource = location.state as { from?: string; firId?: string } | null
  const fromWrit = navigationSource?.from === 'writ' && navigationSource?.firId

  useEffect(() => {
    async function load() {
      if (!proceedingId) {
        setError('Proceeding ID is missing')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)
        const data = await fetchProceedingDetail(proceedingId)
        console.log('[ProceedingDetail] Loaded proceeding data:', data)
        console.log('[ProceedingDetail] Decision Details:', data.decisionDetails)
        console.log('[ProceedingDetail] Decision Details attachment:', data.decisionDetails?.attachment)
        setProceeding(data)
        
        // Check if FIR is completed (has non-draft proceedings)
        if (data.fir) {
          const firId = typeof data.fir === 'object' ? data.fir._id : data.fir
          try {
            const proceedings = await fetchProceedingsByFIR(firId)
            const hasCompletedProceedings = proceedings && proceedings.length > 0 && 
              proceedings.some(p => !p.draft)
            setCanEdit(hasCompletedProceedings || false)
          } catch {
            setCanEdit(false)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load proceeding details')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [proceedingId])

  const handleBack = () => {
    if (fromWrit && navigationSource?.firId) {
      navigate(`/firs/${navigationSource.firId}`)
    } else {
      navigate('/proceedings')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-600 border-r-transparent"></div>
          <p className="mt-4 text-sm text-gray-600">Loading proceeding details...</p>
        </div>
      </div>
    )
  }

  if (error || !proceeding) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Proceeding Details</h1>
          <button
            onClick={handleBack}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back
          </button>
        </div>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Proceeding not found'}
        </div>
      </div>
    )
  }

  const fir = typeof proceeding.fir === 'object' ? proceeding.fir : null

  // Normalize arrays
  const noticeOfMotionEntries = proceeding.noticeOfMotion 
    ? (Array.isArray(proceeding.noticeOfMotion) ? proceeding.noticeOfMotion : [proceeding.noticeOfMotion])
    : []
  
  const replyTrackingEntries = proceeding.replyTracking
    ? (Array.isArray(proceeding.replyTracking) ? proceeding.replyTracking : [proceeding.replyTracking])
    : []

  const argumentEntries = proceeding.argumentDetails
    ? (Array.isArray(proceeding.argumentDetails) ? proceeding.argumentDetails : [proceeding.argumentDetails])
    : []

  const anyOtherEntries = proceeding.anyOtherDetails
    ? (Array.isArray(proceeding.anyOtherDetails) ? proceeding.anyOtherDetails : [proceeding.anyOtherDetails])
    : []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Proceeding Details</h1>
          <p className="mt-1 text-sm text-gray-500">
            {fir ? `Writ: ${fir.firNumber} - ${fir.petitionerName}` : 'Proceeding Information'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && fir && (
            <button
              onClick={() => {
                navigate(`/proceedings/${proceedingId}/edit`)
              }}
              className="rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Edit Proceeding
            </button>
          )}
          <button
            onClick={handleBack}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back
          </button>
        </div>
      </div>

      {/* Basic Information */}
      <section className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900">Basic Information</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <span className="text-sm font-medium text-gray-700">Proceeding Type</span>
            <p className="mt-1 text-sm text-gray-900">
              {PROCEEDING_TYPE_LABEL[proceeding.type] || proceeding.type}
            </p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Sequence Number</span>
            <p className="mt-1 text-sm text-gray-900">#{proceeding.sequence || '—'}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Created At</span>
            <p className="mt-1 text-sm text-gray-900">{formatDateTime(proceeding.createdAt)}</p>
          </div>
          <div>
            <span className="text-sm font-medium text-gray-700">Last Updated</span>
            <p className="mt-1 text-sm text-gray-900">{formatDateTime(proceeding.updatedAt)}</p>
          </div>
        </div>
        {proceeding.summary && (
          <div className="mt-4">
            <span className="text-sm font-medium text-gray-700">Summary</span>
            <p className="mt-1 text-sm text-gray-900">{proceeding.summary}</p>
          </div>
        )}
        {proceeding.details && (
          <div className="mt-4">
            <span className="text-sm font-medium text-gray-700">Details</span>
            <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{proceeding.details}</p>
          </div>
        )}
      </section>

      {/* Hearing Details */}
      {proceeding.hearingDetails && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">Hearing Details</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <span className="text-sm font-medium text-gray-700">Date of Hearing</span>
              <p className="mt-1 text-sm text-gray-900">
                {formatDate(proceeding.hearingDetails.dateOfHearing)}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Name of Judge</span>
              <p className="mt-1 text-sm text-gray-900">
                {proceeding.hearingDetails.judgeName || '—'}
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Court Number</span>
              <p className="mt-1 text-sm text-gray-900">
                {proceeding.hearingDetails.courtNumber || '—'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Type-Specific Details */}
      {proceeding.type === 'NOTICE_OF_MOTION' && noticeOfMotionEntries.length > 0 && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Notice of Motion {noticeOfMotionEntries.length > 1 ? `Entries (${noticeOfMotionEntries.length})` : 'Entry'}
          </h2>
          <div className="mt-4 space-y-6">
            {noticeOfMotionEntries.map((entry, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                {noticeOfMotionEntries.length > 1 && (
                  <h3 className="mb-4 text-lg font-medium text-gray-800">
                    Notice of Motion Entry {index + 1}
                  </h3>
                )}
                <div className="space-y-4">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Attendance Mode</span>
                    <p className="mt-1 text-sm text-gray-900">
                      {entry.attendanceMode === 'BY_FORMAT' ? 'By Format' : 'By Person'}
                    </p>
                  </div>

                  {entry.attendanceMode === 'BY_FORMAT' && (
                    <>
                      <div>
                        <span className="text-sm font-medium text-gray-700">Format Duly Filled and Submitted</span>
                        <p className="mt-1 text-sm text-gray-900">
                          {entry.formatSubmitted !== undefined ? (entry.formatSubmitted ? 'Yes' : 'No') : '—'}
                        </p>
                      </div>
                      {entry.formatFilledBy && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Details of Officer who has Filled it</span>
                          <div className="mt-1 space-y-1 text-sm text-gray-900">
                            <p>Name: {entry.formatFilledBy.name || '—'}</p>
                            <p>Rank: {entry.formatFilledBy.rank || '—'}</p>
                            <p>Mobile: {entry.formatFilledBy.mobile || '—'}</p>
                          </div>
                        </div>
                      )}
                      {entry.aagDgWhoWillAppear && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Details of AAG/DG who will appear</span>
                          <p className="mt-1 text-sm text-gray-900">{entry.aagDgWhoWillAppear}</p>
                        </div>
                      )}
                    </>
                  )}

                  {entry.attendanceMode === 'BY_PERSON' && (
                    <>
                      {entry.attendingOfficerDetails && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Details of Officer who is attending</span>
                          <p className="mt-1 text-sm text-gray-900">{entry.attendingOfficerDetails}</p>
                        </div>
                      )}
                      {entry.investigatingOfficer && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Details of IO Investigating Officer</span>
                          <div className="mt-1 space-y-1 text-sm text-gray-900">
                            <p>Name: {entry.investigatingOfficer.name || '—'}</p>
                            <p>Rank: {entry.investigatingOfficer.rank || '—'}</p>
                            <p>Mobile: {entry.investigatingOfficer.mobile || '—'}</p>
                          </div>
                        </div>
                      )}
                      {entry.appearingAGDetails && (
                        <div>
                          <span className="text-sm font-medium text-gray-700">Details of AG who is appearing</span>
                          <p className="mt-1 text-sm text-gray-900">{entry.appearingAGDetails}</p>
                        </div>
                      )}
                    </>
                  )}

                  {entry.details && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Details of Proceeding</span>
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{entry.details}</p>
                    </div>
                  )}

                  {entry.attachment && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Attachment</span>
                      <div className="mt-1">
                        <button
                          onClick={() => downloadFile(entry.attachment!, entry.attachment!)}
                          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <span>{getFileIcon(entry.attachment)}</span>
                          <span>{entry.attachment}</span>
                          <span className="text-xs">(Download)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {proceeding.type === 'TO_FILE_REPLY' && replyTrackingEntries.length > 0 && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            To File Reply {replyTrackingEntries.length > 1 ? `Entries (${replyTrackingEntries.length})` : 'Entry'}
          </h2>
          <div className="mt-4 space-y-6">
            {replyTrackingEntries.map((entry, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                {replyTrackingEntries.length > 1 && (
                  <h3 className="mb-4 text-lg font-medium text-gray-800">
                    To File Reply Entry {index + 1}
                  </h3>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {entry.officerDeputedForReply && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Officer Deputed for Reply</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.officerDeputedForReply}</p>
                    </div>
                  )}
                  {entry.vettingOfficerDetails && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Vetting Officer Details</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.vettingOfficerDetails}</p>
                    </div>
                  )}
                  {entry.replyFiled !== undefined && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Reply Filed</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.replyFiled ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                  {entry.replyFilingDate && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Date of Filing Reply</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDate(entry.replyFilingDate)}</p>
                    </div>
                  )}
                  {entry.advocateGeneralName && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Name of AG who will vet the Doc</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.advocateGeneralName}</p>
                    </div>
                  )}
                  {entry.replyScrutinizedByHC !== undefined && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Whether reply was scrutinized by HQLHC</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.replyScrutinizedByHC ? 'Yes' : 'No'}</p>
                    </div>
                  )}
                  {entry.investigatingOfficerName && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Name of IO who will appear in Court</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.investigatingOfficerName}</p>
                    </div>
                  )}
                  {entry.proceedingInCourt && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Name of AAG/DG who will appear in Court</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.proceedingInCourt}</p>
                    </div>
                  )}
                  {entry.orderInShort && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Order in Short</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.orderInShort}</p>
                    </div>
                  )}
                  {entry.nextActionablePoint && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Next Actionable Point</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.nextActionablePoint}</p>
                    </div>
                  )}
                  {entry.nextDateOfHearingReply && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Next Date of Hearing</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDate(entry.nextDateOfHearingReply)}</p>
                    </div>
                  )}
                  {entry.attachment && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Attachment</span>
                      <div className="mt-1">
                        <button
                          onClick={() => downloadFile(entry.attachment!, entry.attachment!)}
                          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <span>{getFileIcon(entry.attachment)}</span>
                          <span>{entry.attachment}</span>
                          <span className="text-xs">(Download)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {proceeding.type === 'ARGUMENT' && argumentEntries.length > 0 && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Argument {argumentEntries.length > 1 ? `Entries (${argumentEntries.length})` : 'Entry'}
          </h2>
          <div className="mt-4 space-y-6">
            {argumentEntries.map((entry, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                {argumentEntries.length > 1 && (
                  <h3 className="mb-4 text-lg font-medium text-gray-800">
                    Argument Entry {index + 1}
                  </h3>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {entry.argumentBy && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Argument By</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.argumentBy}</p>
                    </div>
                  )}
                  {entry.argumentWith && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Argument With</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.argumentWith}</p>
                    </div>
                  )}
                  {entry.nextDateOfHearing && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Next Date of Hearing</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDate(entry.nextDateOfHearing)}</p>
                    </div>
                  )}
                  {entry.attachment && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Attachment</span>
                      <div className="mt-1">
                        <button
                          onClick={() => downloadFile(entry.attachment!, entry.attachment!)}
                          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <span>{getFileIcon(entry.attachment)}</span>
                          <span>{entry.attachment}</span>
                          <span className="text-xs">(Download)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {proceeding.type === 'ANY_OTHER' && anyOtherEntries.length > 0 && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Any Other {anyOtherEntries.length > 1 ? `Entries (${anyOtherEntries.length})` : 'Entry'}
          </h2>
          <div className="mt-4 space-y-6">
            {anyOtherEntries.map((entry, index) => (
              <div key={index} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                {anyOtherEntries.length > 1 && (
                  <h3 className="mb-4 text-lg font-medium text-gray-800">
                    Any Other Entry {index + 1}
                  </h3>
                )}
                <div className="space-y-4">
                  {entry.attendingOfficerDetails && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Details of Officer who is attending</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.attendingOfficerDetails}</p>
                    </div>
                  )}
                  {entry.officerDetails && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Details of Officer</span>
                      <div className="mt-1 space-y-1 text-sm text-gray-900">
                        <p>Name: {entry.officerDetails.name || '—'}</p>
                        <p>Rank: {entry.officerDetails.rank || '—'}</p>
                        <p>Mobile: {entry.officerDetails.mobile || '—'}</p>
                      </div>
                    </div>
                  )}
                  {entry.appearingAGDetails && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Details of AG who is appearing</span>
                      <p className="mt-1 text-sm text-gray-900">{entry.appearingAGDetails}</p>
                    </div>
                  )}
                  {entry.details && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Details of Proceeding</span>
                      <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{entry.details}</p>
                    </div>
                  )}
                  {entry.attachment && (
                    <div>
                      <span className="text-sm font-medium text-gray-700">Attachment</span>
                      <div className="mt-1">
                        <button
                          onClick={() => downloadFile(entry.attachment!, entry.attachment!)}
                          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                        >
                          <span>{getFileIcon(entry.attachment)}</span>
                          <span>{entry.attachment}</span>
                          <span className="text-xs">(Download)</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Decision Details */}
      {proceeding.decisionDetails && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">Decision Details</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {proceeding.decisionDetails.writStatus && (
              <div>
                <span className="text-sm font-medium text-gray-700">Writ Status</span>
                <p className="mt-1 text-sm text-gray-900">
                  {WRIT_STATUS_LABEL[proceeding.decisionDetails.writStatus] || proceeding.decisionDetails.writStatus}
                </p>
              </div>
            )}
            {proceeding.decisionDetails.dateOfDecision && (
              <div>
                <span className="text-sm font-medium text-gray-700">Date of Decision</span>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(proceeding.decisionDetails.dateOfDecision)}
                </p>
              </div>
            )}
            {proceeding.decisionDetails.decisionByCourt && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Decision by Court</span>
                <p className="mt-1 text-sm text-gray-900">{proceeding.decisionDetails.decisionByCourt}</p>
              </div>
            )}
            {proceeding.decisionDetails.remarks && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Remarks</span>
                <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
                  {proceeding.decisionDetails.remarks}
                </p>
              </div>
            )}
            {(proceeding.decisionDetails?.attachment || proceeding.orderOfProceedingFilename) && (
              <div className="md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Attachment</span>
                <div className="mt-1">
                  <button
                    onClick={() => {
                      const attachment = proceeding.decisionDetails?.attachment || proceeding.orderOfProceedingFilename
                      if (attachment) {
                        downloadFile(attachment, attachment)
                      }
                    }}
                    className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    <span>{getFileIcon(proceeding.decisionDetails?.attachment || proceeding.orderOfProceedingFilename || '')}</span>
                    <span>{proceeding.decisionDetails?.attachment || proceeding.orderOfProceedingFilename}</span>
                    <span className="text-xs">(Download)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Attachments Section */}
      {(proceeding.attachments && proceeding.attachments.length > 0) || (proceeding.orderOfProceedingFilename && !proceeding.decisionDetails?.attachment) ? (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold text-gray-900">Attachments</h2>
          <div className="mt-4 space-y-3">
            {proceeding.orderOfProceedingFilename && !proceeding.decisionDetails?.attachment && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{getFileIcon(proceeding.orderOfProceedingFilename)}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Order of Proceeding</p>
                    <p className="text-xs text-gray-500">{proceeding.orderOfProceedingFilename}</p>
                  </div>
                </div>
                <button
                  onClick={() => downloadFile(proceeding.orderOfProceedingFilename!, proceeding.orderOfProceedingFilename!)}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Download
                </button>
              </div>
            )}
            {proceeding.attachments && proceeding.attachments.map((attachment, index) => {
              const filename = attachment.fileUrl.startsWith('http') 
                ? attachment.fileUrl.split('/').pop() || attachment.fileName
                : attachment.fileUrl.split('/').pop() || attachment.fileName
              return (
                <div key={index} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getFileIcon(attachment.fileName)}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{attachment.fileName}</p>
                      <p className="text-xs text-gray-500">General attachment</p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadFile(filename, attachment.fileName)}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Download
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )
}

