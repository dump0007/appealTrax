import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createProceeding, fetchFIRDetail, fetchProceedingsByFIR, fetchDraftProceedingByFIR } from '../lib/api'
import { useAuthStore, useApiCacheStore } from '../store'
import type { FIR, Proceeding, ProceedingType, CourtAttendanceMode, CreateProceedingInput, NoticeOfMotionDetails, AnyOtherDetails, PersonDetails, WritStatus, ReplyTrackingDetails } from '../types'

// Helper function to convert NoticeOfMotionDetails to ReplyTrackingDetails for TO_FILE_REPLY
function convertToReplyTracking(entry: NoticeOfMotionDetails): ReplyTrackingDetails {
  return {
    officerDeputedForReply: entry.officerDeputedForReply,
    vettingOfficerDetails: entry.vettingOfficerDetails,
    replyFiled: entry.replyFiled,
    replyFilingDate: entry.replyFilingDate,
    advocateGeneralName: entry.advocateGeneralName,
    replyScrutinizedByHC: entry.replyScrutinizedByHC,
    investigatingOfficerName: entry.investigatingOfficerName,
    proceedingInCourt: entry.proceedingInCourt,
    orderInShort: entry.orderInShort,
    nextActionablePoint: entry.nextActionablePoint,
    nextDateOfHearingReply: entry.nextDateOfHearingReply,
  }
}

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
      aagDgWhoWillAppear: '',
      appearingAGDetails: '',
      attendingOfficerDetails: '',
      investigatingOfficer: { name: '', rank: '', mobile: '' },
      details: '',
      officerDeputedForReply: '',
      vettingOfficerDetails: '',
      replyFiled: false,
      replyFilingDate: '',
      advocateGeneralName: '',
      replyScrutinizedByHC: false,
      investigatingOfficerName: '',
      proceedingInCourt: '',
      orderInShort: '',
      nextActionablePoint: '',
      nextDateOfHearingReply: '',
    }] as NoticeOfMotionDetails[],
    replyTracking: {
      proceedingInCourt: '',
      orderInShort: '',
      nextActionablePoint: '',
      nextDateOfHearing: '',
    },
    anyOtherDetails: [{
      attendingOfficerDetails: '',
      officerDetails: { name: '', rank: '', mobile: '' },
      appearingAGDetails: '',
      details: '',
    }],
    argumentDetails: [{
      argumentBy: '',
      argumentWith: '',
      nextDateOfHearing: '',
    }],
    decisionDetails: {
      writStatus: undefined as WritStatus | undefined,
      dateOfDecision: '',
      decisionByCourt: '',
      remarks: '',
    },
  })
  const [orderOfProceedingFile, setOrderOfProceedingFile] = useState<File | null>(null)
  const [noticeOfMotionFiles, setNoticeOfMotionFiles] = useState<Map<number, File>>(new Map())
  const [replyTrackingFiles, setReplyTrackingFiles] = useState<Map<number, File>>(new Map())
  const [argumentFiles, setArgumentFiles] = useState<Map<number, File>>(new Map())
  const [anyOtherFiles, setAnyOtherFiles] = useState<Map<number, File>>(new Map())
  const [decisionDetailsFile, setDecisionDetailsFile] = useState<File | null>(null)
  const [isResumingIncomplete, setIsResumingIncomplete] = useState(false)

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
        // Reset proceeding type if ARGUMENT is selected but writ type is not QUASHING
        setFormData((prev) => {
          const newData = { ...prev, fir: firId }
          if (data?.writType !== 'QUASHING' && prev.type === 'ARGUMENT') {
            newData.type = 'NOTICE_OF_MOTION'
          }
          return newData
        })
        
        // Check for incomplete form or draft
        const hasCompletedProceedings = proceedingsData && proceedingsData.length > 0 && 
          proceedingsData.some(p => !p.draft)
        
        if (!hasCompletedProceedings) {
          // Check for draft proceeding
          try {
            const draft = await fetchDraftProceedingByFIR(firId)
            if (draft && draft.hearingDetails) {
              const hearingDetails = draft.hearingDetails // TypeScript now knows this is defined
              // Load draft data into form
              const normalizePerson = (person?: { name?: string | null; rank?: string | null; mobile?: string | null } | null) => ({
                name: person?.name || '',
                rank: person?.rank || '',
                mobile: person?.mobile || '',
              })
              const normalizeInvestigatingOfficer = (nom: any) => {
                if (nom?.investigatingOfficer) {
                  return normalizePerson(nom.investigatingOfficer)
                }
                if (nom?.investigatingOfficerName) {
                  return {
                    name: nom.investigatingOfficerName || '',
                    rank: '',
                    mobile: '',
                  }
                }
                return { name: '', rank: '', mobile: '' }
              }
              
              let noticeOfMotionArray: NoticeOfMotionDetails[] = []
              // For TO_FILE_REPLY, data is in replyTracking; for NOTICE_OF_MOTION, it's in noticeOfMotion
              if (draft.type === 'TO_FILE_REPLY' && draft.replyTracking) {
                if (Array.isArray(draft.replyTracking)) {
                  noticeOfMotionArray = draft.replyTracking.map((rt: any) => ({
                    attendanceMode: 'BY_FORMAT' as CourtAttendanceMode, // Dummy value for form state (not used for TO_FILE_REPLY)
                    formatSubmitted: undefined,
                    formatFilledBy: undefined,
                    appearingAG: undefined,
                    appearingAGDetails: undefined,
                    aagDgWhoWillAppear: undefined,
                    attendingOfficer: undefined,
                    attendingOfficerDetails: undefined,
                    investigatingOfficer: undefined,
                    details: '',
                    officerDeputedForReply: rt.officerDeputedForReply || '',
                    vettingOfficerDetails: rt.vettingOfficerDetails || '',
                    replyFiled: rt.replyFiled || false,
                    replyFilingDate: rt.replyFilingDate ? formatDateInputValue(rt.replyFilingDate) : '',
                    advocateGeneralName: rt.advocateGeneralName || '',
                    replyScrutinizedByHC: rt.replyScrutinizedByHC || false,
                    investigatingOfficerName: rt.investigatingOfficerName || '',
                    proceedingInCourt: rt.proceedingInCourt || '',
                    orderInShort: rt.orderInShort || '',
                    nextActionablePoint: rt.nextActionablePoint || '',
                    nextDateOfHearingReply: rt.nextDateOfHearingReply ? formatDateInputValue(rt.nextDateOfHearingReply) : '',
                  }))
                } else {
                  const rt = draft.replyTracking
                  noticeOfMotionArray = [{
                    attendanceMode: 'BY_FORMAT' as CourtAttendanceMode, // Dummy value for form state (not used for TO_FILE_REPLY)
                    formatSubmitted: undefined,
                    formatFilledBy: undefined,
                    appearingAG: undefined,
                    appearingAGDetails: undefined,
                    aagDgWhoWillAppear: undefined,
                    attendingOfficer: undefined,
                    attendingOfficerDetails: undefined,
                    investigatingOfficer: undefined,
                    details: '',
                    officerDeputedForReply: rt.officerDeputedForReply || '',
                    vettingOfficerDetails: rt.vettingOfficerDetails || '',
                    replyFiled: rt.replyFiled || false,
                    replyFilingDate: rt.replyFilingDate ? formatDateInputValue(rt.replyFilingDate) : '',
                    advocateGeneralName: rt.advocateGeneralName || '',
                    replyScrutinizedByHC: rt.replyScrutinizedByHC || false,
                    investigatingOfficerName: rt.investigatingOfficerName || '',
                    proceedingInCourt: rt.proceedingInCourt || '',
                    orderInShort: rt.orderInShort || '',
                    nextActionablePoint: rt.nextActionablePoint || '',
                    nextDateOfHearingReply: rt.nextDateOfHearingReply ? formatDateInputValue(rt.nextDateOfHearingReply) : '',
                  }]
                }
              } else if (draft.noticeOfMotion) {
                if (Array.isArray(draft.noticeOfMotion)) {
                  noticeOfMotionArray = draft.noticeOfMotion.map(nom => ({
                    attendanceMode: nom.attendanceMode || 'BY_FORMAT',
                    formatSubmitted: nom.formatSubmitted || false,
                    formatFilledBy: normalizePerson(nom.formatFilledBy),
                    appearingAG: undefined,
                    appearingAGDetails: nom.attendanceMode === 'BY_PERSON' ? (nom.appearingAGDetails || '') : undefined,
                    aagDgWhoWillAppear: nom.attendanceMode === 'BY_FORMAT' ? (nom.aagDgWhoWillAppear || '') : undefined,
                    attendingOfficer: undefined,
                    attendingOfficerDetails: nom.attendanceMode === 'BY_PERSON' ? (nom.attendingOfficerDetails || '') : undefined,
                    investigatingOfficer: normalizeInvestigatingOfficer(nom),
                    details: nom.details || '',
                    officerDeputedForReply: undefined,
                    vettingOfficerDetails: undefined,
                    replyFiled: undefined,
                    replyFilingDate: undefined,
                    advocateGeneralName: undefined,
                    replyScrutinizedByHC: undefined,
                    investigatingOfficerName: undefined,
                    proceedingInCourt: undefined,
                    orderInShort: undefined,
                    nextActionablePoint: undefined,
                    nextDateOfHearingReply: undefined,
                  }))
                } else {
                  const nom = draft.noticeOfMotion
                  noticeOfMotionArray = [{
                    attendanceMode: nom.attendanceMode || 'BY_FORMAT',
                    formatSubmitted: nom.formatSubmitted || false,
                    formatFilledBy: normalizePerson(nom.formatFilledBy),
                    appearingAG: undefined,
                    appearingAGDetails: nom.attendanceMode === 'BY_PERSON' ? (nom.appearingAGDetails || '') : undefined,
                    aagDgWhoWillAppear: nom.attendanceMode === 'BY_FORMAT' ? (nom.aagDgWhoWillAppear || '') : undefined,
                    attendingOfficer: undefined,
                    attendingOfficerDetails: nom.attendanceMode === 'BY_PERSON' ? (nom.attendingOfficerDetails || '') : undefined,
                    investigatingOfficer: normalizeInvestigatingOfficer(nom),
                    details: nom.details || '',
                    officerDeputedForReply: undefined,
                    vettingOfficerDetails: undefined,
                    replyFiled: undefined,
                    replyFilingDate: undefined,
                    advocateGeneralName: undefined,
                    replyScrutinizedByHC: undefined,
                    investigatingOfficerName: undefined,
                    proceedingInCourt: undefined,
                    orderInShort: undefined,
                    nextActionablePoint: undefined,
                    nextDateOfHearingReply: undefined,
                  }]
                }
              }
              
              setFormData((prev) => ({
                ...prev,
                fir: firId,
                type: draft.type || 'NOTICE_OF_MOTION',
                summary: draft.summary || '',
                details: draft.details || '',
                hearingDetails: {
                  dateOfHearing: hearingDetails.dateOfHearing ? formatDateInputValue(hearingDetails.dateOfHearing) : '',
                  judgeName: hearingDetails.judgeName || '',
                  courtNumber: hearingDetails.courtNumber || '',
                },
                noticeOfMotion: noticeOfMotionArray.length > 0 ? noticeOfMotionArray : prev.noticeOfMotion,
                replyTracking: prev.replyTracking, // Not used anymore - TO_FILE_REPLY data is in noticeOfMotion
                argumentDetails: (draft as any).argumentDetails ? (
                  Array.isArray((draft as any).argumentDetails) 
                    ? (draft as any).argumentDetails.map((ad: any) => ({
                        argumentBy: ad.argumentBy || '',
                        argumentWith: ad.argumentWith || '',
                        nextDateOfHearing: ad.nextDateOfHearing ? formatDateInputValue(ad.nextDateOfHearing) : '',
                      }))
                    : [{
                        argumentBy: (draft as any).argumentDetails.argumentBy || '',
                        argumentWith: (draft as any).argumentDetails.argumentWith || '',
                        nextDateOfHearing: (draft as any).argumentDetails.nextDateOfHearing ? formatDateInputValue((draft as any).argumentDetails.nextDateOfHearing) : '',
                      }]
                ) : prev.argumentDetails,
                anyOtherDetails: (draft as any).anyOtherDetails ? (
                  Array.isArray((draft as any).anyOtherDetails) 
                    ? (draft as any).anyOtherDetails.map((aod: any) => ({
                        attendingOfficerDetails: aod.attendingOfficerDetails || '',
                        officerDetails: aod.officerDetails ? {
                          name: aod.officerDetails.name || '',
                          rank: aod.officerDetails.rank || '',
                          mobile: aod.officerDetails.mobile || '',
                        } : { name: '', rank: '', mobile: '' },
                        appearingAGDetails: aod.appearingAGDetails || '',
                        details: aod.details || '',
                      }))
                    : [{
                        attendingOfficerDetails: (draft as any).anyOtherDetails.attendingOfficerDetails || '',
                        officerDetails: (draft as any).anyOtherDetails.officerDetails ? {
                          name: (draft as any).anyOtherDetails.officerDetails.name || '',
                          rank: (draft as any).anyOtherDetails.officerDetails.rank || '',
                          mobile: (draft as any).anyOtherDetails.officerDetails.mobile || '',
                        } : { name: '', rank: '', mobile: '' },
                        appearingAGDetails: (draft as any).anyOtherDetails.appearingAGDetails || '',
                        details: (draft as any).anyOtherDetails.details || '',
                      }]
                ) : prev.anyOtherDetails,
              }))
              
              setShowForm(true)
              setIsResumingIncomplete(true)
            } else {
              // No draft, but incomplete form - open form to complete
              setShowForm(true)
              setIsResumingIncomplete(true)
            }
          } catch {
            // Error checking for draft, but still mark as incomplete
            setShowForm(true)
            setIsResumingIncomplete(true)
          }
        }
        
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
          aagDgWhoWillAppear: '',
          attendingOfficer: { name: '', rank: '', mobile: '' },
          investigatingOfficer: { name: '', rank: '', mobile: '' },
          details: '',
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
    // Clean up file for removed entry and reindex remaining files
    setNoticeOfMotionFiles(prev => {
      const newMap = new Map<number, File>()
      prev.forEach((file, idx) => {
        if (idx < index) {
          newMap.set(idx, file)
        } else if (idx > index) {
          newMap.set(idx - 1, file)
        }
      })
      return newMap
    })
  }

  function addToFileReplyEntry() {
    setFormData((prev) => ({
      ...prev,
      noticeOfMotion: [
        ...prev.noticeOfMotion,
        {
          attendanceMode: 'BY_FORMAT' as CourtAttendanceMode,
          formatSubmitted: false,
          formatFilledBy: { name: '', rank: '', mobile: '' },
          aagDgWhoWillAppear: '',
          appearingAGDetails: '',
          attendingOfficerDetails: '',
          investigatingOfficer: { name: '', rank: '', mobile: '' },
          investigatingOfficerName: '',
          details: '',
          officerDeputedForReply: '',
          vettingOfficerDetails: '',
          replyFiled: false,
          replyFilingDate: '',
          advocateGeneralName: '',
          replyScrutinizedByHC: false,
          proceedingInCourt: '',
          orderInShort: '',
          nextActionablePoint: '',
          nextDateOfHearingReply: '',
        },
      ],
    }))
  }

  function removeToFileReplyEntry(index: number) {
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

  function addAnyOtherEntry() {
    setFormData((prev) => ({
      ...prev,
      anyOtherDetails: [
        ...(prev.anyOtherDetails || []),
        {
          attendingOfficerDetails: '',
          officerDetails: { name: '', rank: '', mobile: '' },
          appearingAGDetails: '',
          details: '',
        },
      ],
    }))
  }

  function removeAnyOtherEntry(index: number) {
    setFormData((prev) => ({
      ...prev,
      anyOtherDetails: (prev.anyOtherDetails || []).filter((_, i) => i !== index),
    }))
    // Clean up file for removed entry
    setNoticeOfMotionFiles(prev => {
      const newMap = new Map<number, File>()
      prev.forEach((file, idx) => {
        if (idx < index) {
          newMap.set(idx, file)
        } else if (idx > index) {
          newMap.set(idx - 1, file)
        }
      })
      return newMap
    })
  }

  function updateAnyOtherEntry(index: number, field: keyof AnyOtherDetails, value: any) {
    setFormData((prev) => {
      const updated = [...(prev.anyOtherDetails || [])]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, anyOtherDetails: updated }
    })
  }

  function updateAnyOtherPerson(index: number, personType: 'officerDetails', field: 'name' | 'rank' | 'mobile', value: string) {
    setFormData((prev) => {
      const updated = [...(prev.anyOtherDetails || [])]
      updated[index] = {
        ...updated[index],
        [personType]: {
          name: (updated[index][personType] as PersonDetails)?.name || '',
          rank: (updated[index][personType] as PersonDetails)?.rank || '',
          mobile: (updated[index][personType] as PersonDetails)?.mobile || '',
          [field]: value,
        } as { name: string; rank: string; mobile: string },
      }
      return { ...prev, anyOtherDetails: updated }
    })
  }

  function addArgumentEntry() {
    setFormData((prev) => ({
      ...prev,
      argumentDetails: [
        ...(prev.argumentDetails || []),
        {
          argumentBy: '',
          argumentWith: '',
          nextDateOfHearing: '',
        },
      ],
    }))
  }

  function removeArgumentEntry(index: number) {
    setFormData((prev) => ({
      ...prev,
      argumentDetails: (prev.argumentDetails || []).filter((_, i) => i !== index),
    }))
    // Clean up file for removed entry
    setNoticeOfMotionFiles(prev => {
      const newMap = new Map<number, File>()
      prev.forEach((file, idx) => {
        if (idx < index) {
          newMap.set(idx, file)
        } else if (idx > index) {
          newMap.set(idx - 1, file)
        }
      })
      return newMap
    })
  }

  function updateArgumentEntry(index: number, field: 'argumentBy' | 'argumentWith' | 'nextDateOfHearing', value: any) {
    setFormData((prev) => {
      const updated = [...(prev.argumentDetails || [])]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, argumentDetails: updated }
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
        payload.replyTracking = formData.noticeOfMotion.length === 1 
          ? convertToReplyTracking(formData.noticeOfMotion[0])
          : formData.noticeOfMotion.map(convertToReplyTracking)
      } else if (formData.type === 'ARGUMENT') {
        payload.argumentDetails = formData.argumentDetails && formData.argumentDetails.length > 0 
          ? (formData.argumentDetails.length === 1 ? formData.argumentDetails[0] : formData.argumentDetails)
          : undefined
      } else if (formData.type === 'ANY_OTHER') {
        payload.anyOtherDetails = formData.anyOtherDetails && formData.anyOtherDetails.length > 0 
          ? formData.anyOtherDetails
          : undefined
      }
      
      // Add Decision Details if writStatus is provided
      if (formData.decisionDetails?.writStatus) {
        payload.decisionDetails = formData.decisionDetails
      }

      // Remove createdBy from payload - backend will set it from auth context
      delete payload.createdBy

      // Prepare attachment files based on proceeding type
      const attachmentFiles: {
        noticeOfMotion?: Map<number, File>
        replyTracking?: Map<number, File>
        argumentDetails?: Map<number, File>
        anyOtherDetails?: Map<number, File>
        decisionDetails?: File
      } = {}

      if (formData.type === 'NOTICE_OF_MOTION' && noticeOfMotionFiles.size > 0) {
        attachmentFiles.noticeOfMotion = noticeOfMotionFiles
      } else if (formData.type === 'TO_FILE_REPLY' && replyTrackingFiles.size > 0) {
        attachmentFiles.replyTracking = replyTrackingFiles
      } else if (formData.type === 'ARGUMENT' && argumentFiles.size > 0) {
        attachmentFiles.argumentDetails = argumentFiles
      } else if (formData.type === 'ANY_OTHER' && anyOtherFiles.size > 0) {
        attachmentFiles.anyOtherDetails = anyOtherFiles
      }

      if (decisionDetailsFile) {
        attachmentFiles.decisionDetails = decisionDetailsFile
      }

      const newProceeding = await createProceeding(
        payload, 
        orderOfProceedingFile || undefined,
        Object.keys(attachmentFiles).length > 0 ? attachmentFiles : undefined
      )
      setLocalProceedings((prev) => [newProceeding, ...prev])
      setShowForm(false)
      setIsResumingIncomplete(false)
      setOrderOfProceedingFile(null)
      setNoticeOfMotionFiles(new Map())
      setReplyTrackingFiles(new Map())
      setArgumentFiles(new Map())
      setAnyOtherFiles(new Map())
      setDecisionDetailsFile(null)
      
      // Reset form but keep FIR selected
      setFormData((prev) => ({
        ...prev,
        type: 'NOTICE_OF_MOTION',
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
          aagDgWhoWillAppear: '',
          appearingAGDetails: '',
          attendingOfficerDetails: '',
          investigatingOfficer: { name: '', rank: '', mobile: '' },
          details: '',
          officerDeputedForReply: '',
          vettingOfficerDetails: '',
          replyFiled: false,
          replyFilingDate: '',
          advocateGeneralName: '',
          replyScrutinizedByHC: false,
          investigatingOfficerName: '',
          proceedingInCourt: '',
          orderInShort: '',
          nextActionablePoint: '',
          nextDateOfHearingReply: '',
        }],
        replyTracking: {
          proceedingInCourt: '',
          orderInShort: '',
          nextActionablePoint: '',
          nextDateOfHearing: '',
        },
        argumentDetails: [{
          argumentBy: '',
          argumentWith: '',
          nextDateOfHearing: '',
        }],
        anyOtherDetails: [{
          attendingOfficerDetails: '',
          officerDetails: { name: '', rank: '', mobile: '' },
          appearingAGDetails: '',
          details: '',
        }],
        decisionDetails: {
          writStatus: undefined,
          dateOfDecision: '',
          decisionByCourt: '',
          remarks: '',
        },
      }))
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
          <StatusBadge status={fir.status || 'UNKNOWN'} />
          {localProceedings && localProceedings.length > 0 && 
            localProceedings.some(p => !p.draft) && (
            <button
              type="button"
              onClick={() => navigate(`/firs?edit=${firId}`)}
              className="rounded-md border border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Edit Writ
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const newShowForm = !showForm
              setShowForm(newShowForm)
              // Reset incomplete flag when manually opening form for complete FIR
              if (newShowForm) {
                // Only reset if there are completed proceedings (complete FIR)
                const hasCompleted = localProceedings && localProceedings.length > 0 && 
                  localProceedings.some(p => !p.draft)
                if (hasCompleted) {
                  setIsResumingIncomplete(false)
                }
              }
            }}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {showForm ? 'Close Proceeding Form' : 'Record New Proceeding'}
          </button>
        </div>
      </div>

      {/* Incomplete Form Prompt */}
      {isResumingIncomplete && showForm && (
        <div className="mb-6 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800">Incomplete Form</h3>
              <p className="mt-1 text-sm text-amber-700">
                This writ application was started but not completed. Please review the information below and complete the proceeding form to finalize the application.
              </p>
              <div className="mt-3">
                <Link
                  to={`/firs?resume=${firId}`}
                  className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                >
                  Edit FIR Details (Step 1)
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <div 
                    className="flex-1 rounded-lg border bg-white p-4 shadow-sm transition hover:bg-gray-50 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => navigate(`/proceedings/${item._id}`, { state: { from: 'writ', firId } })}
                      >
                        <div className="text-sm font-semibold text-gray-800">
                          {PROCEEDING_TYPE_LABEL[item.type] || item.type}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDate(item.hearingDetails?.dateOfHearing || item.createdAt)}
                        </div>
                      </div>
                      {localProceedings && localProceedings.length > 0 && 
                        localProceedings.some(p => !p.draft) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/proceedings/${item._id}/edit`)
                          }}
                          className="rounded-md border border-gray-600 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                      )}
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
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-gray-900">Record New Proceeding</h2>
              <p className="mt-1 text-sm text-gray-600">Fill in the details for the new proceeding</p>
            </div>
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
                </div>
              </div>

              {/* Section 2: Type of Proceeding */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Type of Proceeding</h3>
                <label className="mb-4 block text-sm font-medium text-gray-700">
                  Select Type <span className="text-red-500 ml-1">*</span>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.type}
                    onChange={(e) => {
                      const newType = e.target.value as ProceedingType
                      setFormData((prev) => ({ ...prev, type: newType }))
                    }}
                    required
                  >
                    {PROCEEDING_TYPE_OPTIONS.filter((opt) => 
                      opt.value !== 'ARGUMENT' || fir?.writType === 'QUASHING'
                    ).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                {formData.type === 'NOTICE_OF_MOTION' && (
                  <div className="space-y-6">
                    {formData.noticeOfMotion.map((entry, index) => (
                      <div key={index} className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-700">
                            {formData.noticeOfMotion.length === 1 
                              ? 'Notice of Motion' 
                              : `Notice of Motion #${index + 1}`}
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
                                Details of AAG/DG who will appear <span className="text-red-500">*</span>
                                <input
                                  type="text"
                                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                                  placeholder="Enter details of AAG/DG who will appear"
                                  value={entry.aagDgWhoWillAppear || ''}
                                  onChange={(e) =>
                                    updateNoticeOfMotionEntry(index, 'aagDgWhoWillAppear', e.target.value)
                                  }
                                  required
                                />
                              </label>
                            </>
                          )}

                          {entry.attendanceMode === 'BY_PERSON' && (
                            <>
                              <label className="md:col-span-2 text-sm font-medium text-gray-700">
                                Details of Officer who is attending <span className="text-red-500">*</span>
                                <input
                                  type="text"
                                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                                  placeholder="Enter details of officer who is attending"
                                  value={entry.attendingOfficerDetails || ''}
                                  onChange={(e) =>
                                    updateNoticeOfMotionEntry(index, 'attendingOfficerDetails', e.target.value)
                                  }
                                  required
                                />
                              </label>

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
                                Details of AG who is appearing <span className="text-red-500">*</span>
                                <input
                                  type="text"
                                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                                  placeholder="Enter details of AG who is appearing"
                                  value={entry.appearingAGDetails || ''}
                                  onChange={(e) =>
                                    updateNoticeOfMotionEntry(index, 'appearingAGDetails', e.target.value)
                                  }
                                  required
                                />
                              </label>
                            </>
                          )}
                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          Details of proceeding <span className="text-red-500">*</span>
                          <textarea
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            rows={3}
                            value={entry.details || ''}
                            onChange={(e) =>
                              updateNoticeOfMotionEntry(index, 'details', e.target.value)
                            }
                            required
                            placeholder="Enter details of proceeding"
                          />
                        </label>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {entry.attendanceMode === 'BY_FORMAT' 
                              ? 'Upload Doc of Proceeding (PDF, PNG, JPEG, JPG, Excel)' 
                              : 'Upload Files (Person) (PDF, PNG, JPEG, JPG, Excel)'}
                          </label>
                          <input
                            type="file"
                            id={`notice-of-motion-file-firdetail-${index}`}
                            accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
                            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                                if (!allowedTypes.includes(file.type)) {
                                  setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
                                  e.target.value = ''
                                  return
                                }
                                setNoticeOfMotionFiles(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(index, file)
                                  return newMap
                                })
                                setError(null)
                              }
                            }}
                          />
                          {noticeOfMotionFiles.get(index) && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                              <span>{noticeOfMotionFiles.get(index)?.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setNoticeOfMotionFiles(prev => {
                                    const newMap = new Map(prev)
                                    newMap.delete(index)
                                    return newMap
                                  })
                                  const fileInput = document.getElementById(`notice-of-motion-file-firdetail-${index}`) as HTMLInputElement
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
                  <div className="space-y-4">
                    {formData.noticeOfMotion.map((entry, index) => (
                      <div key={index} className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-700">
                            {formData.noticeOfMotion.length === 1 
                              ? 'To File Reply Entry' 
                              : `To File Reply Entry ${index + 1}`}
                          </h4>
                          {formData.noticeOfMotion.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeToFileReplyEntry(index)}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="text-sm font-medium text-gray-700">
                            Officer deputed for file reply <span className="text-red-500 ml-1">*</span>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.officerDeputedForReply || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'officerDeputedForReply', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            Name of AG who will vet the Doc <span className="text-red-500 ml-1">*</span>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.advocateGeneralName || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'advocateGeneralName', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            If reply was filed <span className="text-red-500 ml-1">*</span>
                            <select
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.replyFiled ? 'true' : 'false'}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'replyFiled', e.target.value === 'true')
                              }
                              required
                            >
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          </label>

                          {entry.replyFiled && (
                            <label className="text-sm font-medium text-gray-700">
                              Date of filing reply <span className="text-red-500 ml-1">*</span>
                              <input
                                type="date"
                                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                                value={formatDateInputValue(entry.replyFilingDate)}
                                onChange={(e) =>
                                  updateNoticeOfMotionEntry(index, 'replyFilingDate', e.target.value)
                                }
                                required
                              />
                            </label>
                          )}

                          <label className="text-sm font-medium text-gray-700">
                            Name of AAG/DG who will appear in Court <span className="text-red-500 ml-1">*</span>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.vettingOfficerDetails || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'vettingOfficerDetails', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            Name of IO who will appear in Court <span className="text-red-500 ml-1">*</span>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Enter name of IO who will appear in Court"
                              value={entry.investigatingOfficerName || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'investigatingOfficerName', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            Whether reply was scrutinized by HQLHC <span className="text-red-500 ml-1">*</span>
                            <select
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.replyScrutinizedByHC ? 'true' : 'false'}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'replyScrutinizedByHC', e.target.value === 'true')
                              }
                              required
                            >
                              <option value="false">No</option>
                              <option value="true">Yes</option>
                            </select>
                          </label>

                          <label className="md:col-span-2 text-sm font-medium text-gray-700">
                            Proceeding in court <span className="text-red-500 ml-1">*</span>
                            <textarea
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              rows={2}
                              value={entry.proceedingInCourt || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'proceedingInCourt', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            Order in short <span className="text-red-500 ml-1">*</span>
                            <input
                              type="text"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={entry.orderInShort || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'orderInShort', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="md:col-span-2 text-sm font-medium text-gray-700">
                            Next actionable point <span className="text-red-500 ml-1">*</span>
                            <textarea
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              rows={2}
                              value={entry.nextActionablePoint || ''}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'nextActionablePoint', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            Next Date of Hearing <span className="text-red-500 ml-1">*</span>
                            <input
                              type="date"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={formatDateInputValue(entry.nextDateOfHearingReply)}
                              onChange={(e) =>
                                updateNoticeOfMotionEntry(index, 'nextDateOfHearingReply', e.target.value)
                              }
                              required
                            />
                          </label>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Upload Order of Proceeding
                              <span className="ml-1 text-xs text-gray-500">(PDF, PNG, JPEG, JPG, Excel)</span>
                            </label>
                            <div className="mt-2 flex items-center gap-3">
                              <input
                                id={`order-of-proceeding-file-firdetail-reply-${index}`}
                                type="file"
                                accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
                                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                                    if (!allowedTypes.includes(file.type)) {
                                      setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
                                      e.target.value = ''
                                      return
                                    }
                                    setReplyTrackingFiles(prev => {
                                      const newMap = new Map(prev)
                                      newMap.set(index, file)
                                      return newMap
                                    })
                                    setError(null)
                                  }
                                }}
                              />
                              {replyTrackingFiles.get(index) && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <span className="font-medium text-indigo-700">New file: {replyTrackingFiles.get(index)?.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyTrackingFiles(prev => {
                                        const newMap = new Map(prev)
                                        newMap.delete(index)
                                        return newMap
                                      })
                                      const fileInput = document.getElementById(`order-of-proceeding-file-firdetail-reply-${index}`) as HTMLInputElement
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
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        addToFileReplyEntry()
                      }}
                      className="w-full rounded-md border-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                    >
                      + ADD ANOTHER TO FILE REPLY ENTRY
                    </button>
                  </div>
                )}

                {formData.type === 'ARGUMENT' && (
                  <div className="space-y-4">
                    {(formData.argumentDetails || []).map((entry, index) => (
                      <div key={index} className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                        <div className="mb-4 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-gray-700">
                            {(formData.argumentDetails || []).length === 1 
                              ? 'Argument Entry' 
                              : `Argument Entry ${index + 1}`}
                          </h4>
                          {(formData.argumentDetails || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeArgumentEntry(index)}
                              className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="md:col-span-2 text-sm font-medium text-gray-700">
                            Argument by <span className="text-red-500 ml-1">*</span>
                            <textarea
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              rows={3}
                              value={entry.argumentBy || ''}
                              onChange={(e) =>
                                updateArgumentEntry(index, 'argumentBy', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="md:col-span-2 text-sm font-medium text-gray-700">
                            Argument with <span className="text-red-500 ml-1">*</span>
                            <textarea
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              rows={3}
                              value={entry.argumentWith || ''}
                              onChange={(e) =>
                                updateArgumentEntry(index, 'argumentWith', e.target.value)
                              }
                              required
                            />
                          </label>

                          <label className="text-sm font-medium text-gray-700">
                            Next Date of Hearing <span className="text-red-500 ml-1">*</span>
                            <input
                              type="date"
                              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                              value={formatDateInputValue(entry.nextDateOfHearing)}
                              onChange={(e) =>
                                updateArgumentEntry(index, 'nextDateOfHearing', e.target.value)
                              }
                              required
                            />
                          </label>

                          <div className="flex items-end">
                            <label className="block w-full text-sm font-medium text-gray-700">
                              Upload Order of Proceeding
                              <span className="ml-1 text-xs text-gray-500">(PDF, PNG, JPEG, JPG, Excel)</span>
                              <input
                                id={`argument-file-firdetail-${index}`}
                                type="file"
                                accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
                                className="mt-2 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                                    if (!allowedTypes.includes(file.type)) {
                                      setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
                                      e.target.value = ''
                                      return
                                    }
                                    setArgumentFiles(prev => {
                                      const newMap = new Map(prev)
                                      newMap.set(index, file)
                                      return newMap
                                    })
                                    setError(null)
                                  }
                                }}
                              />
                              {argumentFiles.get(index) && (
                                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                                  <span className="font-medium text-indigo-700">New file: {argumentFiles.get(index)?.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setArgumentFiles(prev => {
                                        const newMap = new Map(prev)
                                        newMap.delete(index)
                                        return newMap
                                      })
                                      const fileInput = document.getElementById(`argument-file-firdetail-${index}`) as HTMLInputElement
                                      if (fileInput) fileInput.value = ''
                                    }}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        addArgumentEntry()
                      }}
                      className="w-full rounded-md border-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                    >
                      + ADD ANOTHER ARGUMENT ENTRY
                    </button>
                  </div>
                )}
              </div>

              {/* Section 3: Any Other */}
              {formData.type === 'ANY_OTHER' && (
                <div className="space-y-4">
                  {(formData.anyOtherDetails || []).map((entry, index) => (
                    <div key={index} className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-gray-700">
                          {(formData.anyOtherDetails || []).length === 1 
                            ? 'Any Other Entry' 
                            : `Any Other Entry ${index + 1}`}
                        </h4>
                        {(formData.anyOtherDetails || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAnyOtherEntry(index)}
                            className="text-xs font-medium text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="text-sm font-medium text-gray-700">
                          Details of Officer who is attending <span className="text-red-500 ml-1">*</span>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            placeholder="Enter details of officer who is attending"
                            value={entry.attendingOfficerDetails || ''}
                            onChange={(e) =>
                              updateAnyOtherEntry(index, 'attendingOfficerDetails', e.target.value)
                            }
                            required
                          />
                        </label>

                        <label className="text-sm font-medium text-gray-700">
                          Details of officer <span className="text-red-500 ml-1">*</span>
                          <div className="mt-1 grid gap-2 md:grid-cols-3">
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Name *"
                              value={entry.officerDetails?.name || ''}
                              onChange={(e) =>
                                updateAnyOtherPerson(index, 'officerDetails', 'name', e.target.value)
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Rank *"
                              value={entry.officerDetails?.rank || ''}
                              onChange={(e) =>
                                updateAnyOtherPerson(index, 'officerDetails', 'rank', e.target.value)
                              }
                              required
                            />
                            <input
                              type="text"
                              className="rounded-md border border-gray-300 px-3 py-2"
                              placeholder="Mobile *"
                              value={entry.officerDetails?.mobile || ''}
                              onChange={(e) =>
                                updateAnyOtherPerson(index, 'officerDetails', 'mobile', e.target.value)
                              }
                              required
                            />
                          </div>
                        </label>

                        <label className="text-sm font-medium text-gray-700">
                          Details of AG who is appearing <span className="text-red-500 ml-1">*</span>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            placeholder="Enter details of AG who is appearing"
                            value={entry.appearingAGDetails || ''}
                            onChange={(e) =>
                              updateAnyOtherEntry(index, 'appearingAGDetails', e.target.value)
                            }
                            required
                          />
                        </label>

                        <label className="md:col-span-2 text-sm font-medium text-gray-700">
                          Details of proceeding <span className="text-red-500 ml-1">*</span>
                          <textarea
                            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                            rows={2}
                            value={entry.details || ''}
                            onChange={(e) =>
                              updateAnyOtherEntry(index, 'details', e.target.value)
                            }
                            required
                          />
                        </label>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Upload Doc of Proceeding
                            <span className="ml-1 text-xs text-gray-500">(PDF, PNG, JPEG, JPG, Excel)</span>
                          </label>
                          <div className="mt-2 flex items-center gap-3">
                            <input
                              id={`any-other-file-firdetail-${index}`}
                              type="file"
                              accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
                              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                                  if (!allowedTypes.includes(file.type)) {
                                    setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
                                    e.target.value = ''
                                    return
                                  }
                                  setAnyOtherFiles(prev => {
                                    const newMap = new Map(prev)
                                    newMap.set(index, file)
                                    return newMap
                                  })
                                  setError(null)
                                }
                              }}
                            />
                            {anyOtherFiles.get(index) && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="font-medium text-indigo-700">New file: {anyOtherFiles.get(index)?.name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAnyOtherFiles(prev => {
                                      const newMap = new Map(prev)
                                      newMap.delete(index)
                                      return newMap
                                    })
                                    const fileInput = document.getElementById(`any-other-file-firdetail-${index}`) as HTMLInputElement
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
                  ))}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      addAnyOtherEntry()
                    }}
                    className="w-full rounded-md border-2 border-purple-500 px-4 py-2 text-sm font-medium text-purple-600 hover:bg-purple-50"
                  >
                    + ADD ANOTHER ANY OTHER ENTRY
                  </button>
                </div>
              )}

              {/* Section 4: Decision Details */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Decision Details</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-gray-700">
                    Writ status <span className="text-red-500 ml-1">*</span>
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                      value={formData.decisionDetails?.writStatus || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          decisionDetails: {
                            writStatus: e.target.value ? (e.target.value as WritStatus) : undefined,
                            dateOfDecision: prev.decisionDetails?.dateOfDecision || '',
                            decisionByCourt: prev.decisionDetails?.decisionByCourt || '',
                            remarks: prev.decisionDetails?.remarks || '',
                          },
                        }))
                      }
                      required
                    >
                      <option value="">Select writ status</option>
                      <option value="ALLOWED">Allowed</option>
                      <option value="PENDING">Pending</option>
                      <option value="DISMISSED">Dismissed</option>
                      <option value="WITHDRAWN">Withdrawn</option>
                      <option value="DIRECTION">Direction</option>
                    </select>
                  </label>

                  <label className="text-sm font-medium text-gray-700">
                    Date of Decision
                    <input
                      type="date"
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                      value={formatDateInputValue(formData.decisionDetails?.dateOfDecision)}
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
                      value={formData.decisionDetails?.decisionByCourt || ''}
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
                      value={formData.decisionDetails?.remarks || ''}
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
                      <span className="ml-1 text-xs text-gray-500">(PDF, PNG, JPEG, JPG, Excel)</span>
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
                  onClick={() => {
                    setShowForm(false)
                    setIsResumingIncomplete(false)
                  }}
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
  ALLOWED: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  DISMISSED: 'bg-rose-100 text-rose-700',
  WITHDRAWN: 'bg-rose-100 text-rose-700',
  DIRECTION: 'bg-blue-100 text-blue-700',
}

const PROCEEDING_TYPE_LABEL: Record<ProceedingType, string> = {
  NOTICE_OF_MOTION: 'Notice of Motion',
  TO_FILE_REPLY: 'To File Reply',
  ARGUMENT: 'Argument',
  ANY_OTHER: 'Any Other',
}

const PROCEEDING_TYPE_OPTIONS = [
  { value: 'NOTICE_OF_MOTION', label: 'Notice of Motion' },
  { value: 'TO_FILE_REPLY', label: 'To File Reply' },
  { value: 'ARGUMENT', label: 'Argument' },
  { value: 'ANY_OTHER', label: 'Any Other' },
]

// Removed WritStatusOptions as it's no longer needed

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
    PAROLE: 'Parole',
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

