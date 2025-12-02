import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchFIRDetail, fetchProceedingsByFIR, fetchProceedingDetail, updateProceeding } from '../lib/api'
import { useAuthStore } from '../store'
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

const PROCEEDING_TYPE_OPTIONS = [
  { value: 'NOTICE_OF_MOTION', label: 'Notice of Motion' },
  { value: 'TO_FILE_REPLY', label: 'To File Reply' },
  { value: 'ARGUMENT', label: 'Argument' },
  { value: 'ANY_OTHER', label: 'Any Other' },
]

export default function EditProceeding() {
  const { proceedingId } = useParams<{ proceedingId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.currentUser)
  const [fir, setFir] = useState<FIR | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [originalProceedingData, setOriginalProceedingData] = useState<Proceeding | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [filesToDelete, setFilesToDelete] = useState<string[]>([])
  const [proceedingTypeChanged, setProceedingTypeChanged] = useState(false)
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

  const formatDateInputValue = (value: string | Date | null | undefined): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ''
    }
    return date.toISOString().split('T')[0]
  }

  // Load proceeding and FIR data
  useEffect(() => {
    async function load() {
      if (!proceedingId) {
        setError('Missing proceeding identifier')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        const proceeding = await fetchProceedingDetail(proceedingId)
        setOriginalProceedingData(proceeding)
        
        const firId = typeof proceeding.fir === 'object' ? proceeding.fir._id : proceeding.fir
        if (!firId) {
          setError('FIR ID not found in proceeding')
          setLoading(false)
          return
        }

        // Fetch FIR and proceedings to verify completion
        const [firData, proceedingsData] = await Promise.all([
          fetchFIRDetail(firId),
          fetchProceedingsByFIR(firId),
        ])
        
        setFir(firData)
        
        // Verify FIR has completed proceedings
        const hasCompletedProceedings = proceedingsData && proceedingsData.length > 0 && 
          proceedingsData.some(p => !p.draft)
        
        if (!hasCompletedProceedings) {
          setError('Cannot edit proceeding: FIR must be fully completed before editing.')
          setLoading(false)
          return
        }

        // Load proceeding data into form
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
        
        if (proceeding.type === 'TO_FILE_REPLY' && proceeding.replyTracking) {
          if (Array.isArray(proceeding.replyTracking)) {
            noticeOfMotionArray = proceeding.replyTracking.map((rt: any) => ({
              attendanceMode: 'BY_FORMAT' as CourtAttendanceMode,
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
            const rt = proceeding.replyTracking
            noticeOfMotionArray = [{
              attendanceMode: 'BY_FORMAT' as CourtAttendanceMode,
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
        } else if (proceeding.noticeOfMotion) {
          if (Array.isArray(proceeding.noticeOfMotion)) {
            noticeOfMotionArray = proceeding.noticeOfMotion.map(nom => ({
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
            const nom = proceeding.noticeOfMotion
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

        const argumentDetailsArray = proceeding.argumentDetails
          ? (Array.isArray(proceeding.argumentDetails) ? proceeding.argumentDetails : [proceeding.argumentDetails]).map((arg: any) => ({
              argumentBy: arg.argumentBy || '',
              argumentWith: arg.argumentWith || '',
              nextDateOfHearing: arg.nextDateOfHearing ? formatDateInputValue(arg.nextDateOfHearing) : '',
            }))
          : [{
              argumentBy: '',
              argumentWith: '',
              nextDateOfHearing: '',
            }]

        const anyOtherDetailsArray = proceeding.anyOtherDetails
          ? (Array.isArray(proceeding.anyOtherDetails) ? proceeding.anyOtherDetails : [proceeding.anyOtherDetails]).map((aod: any) => ({
              attendingOfficerDetails: aod.attendingOfficerDetails || '',
              officerDetails: normalizePerson(aod.officerDetails),
              appearingAGDetails: aod.appearingAGDetails || '',
              details: aod.details || '',
            }))
          : [{
              attendingOfficerDetails: '',
              officerDetails: { name: '', rank: '', mobile: '' },
              appearingAGDetails: '',
              details: '',
            }]

        setFormData({
          fir: firId,
          type: proceeding.type,
          summary: proceeding.summary || '',
          details: proceeding.details || '',
          hearingDetails: {
            dateOfHearing: proceeding.hearingDetails?.dateOfHearing ? formatDateInputValue(proceeding.hearingDetails.dateOfHearing) : '',
            judgeName: proceeding.hearingDetails?.judgeName || '',
            courtNumber: proceeding.hearingDetails?.courtNumber || '',
          },
          noticeOfMotion: noticeOfMotionArray.length > 0 ? noticeOfMotionArray : [{
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
          argumentDetails: argumentDetailsArray,
          anyOtherDetails: anyOtherDetailsArray,
          decisionDetails: {
            writStatus: proceeding.decisionDetails?.writStatus,
            dateOfDecision: proceeding.decisionDetails?.dateOfDecision ? formatDateInputValue(proceeding.decisionDetails.dateOfDecision) : '',
            decisionByCourt: proceeding.decisionDetails?.decisionByCourt || '',
            remarks: proceeding.decisionDetails?.remarks || '',
          },
        })
        
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load proceeding for editing')
        setLoading(false)
      }
    }
    load()
  }, [proceedingId])

  // Form handlers
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
    setReplyTrackingFiles(prev => {
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
    setAnyOtherFiles(prev => {
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
    setArgumentFiles(prev => {
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

  function handleProceedingTypeChange(newType: ProceedingType) {
    if (!originalProceedingData) return
    
    const oldType = originalProceedingData.type
    if (oldType === newType) {
      setProceedingTypeChanged(false)
      return
    }

    // Track files to delete
    const filesToDeleteList: string[] = []
    
    // Delete old proceeding type files
    if (oldType === 'NOTICE_OF_MOTION' && originalProceedingData.noticeOfMotion) {
      const entries = Array.isArray(originalProceedingData.noticeOfMotion) 
        ? originalProceedingData.noticeOfMotion 
        : [originalProceedingData.noticeOfMotion]
      entries.forEach(entry => {
        if (entry.attachment) filesToDeleteList.push(entry.attachment)
      })
    } else if (oldType === 'TO_FILE_REPLY' && originalProceedingData.replyTracking) {
      const entries = Array.isArray(originalProceedingData.replyTracking) 
        ? originalProceedingData.replyTracking 
        : [originalProceedingData.replyTracking]
      entries.forEach(entry => {
        if (entry.attachment) filesToDeleteList.push(entry.attachment)
      })
    } else if (oldType === 'ARGUMENT' && originalProceedingData.argumentDetails) {
      const entries = Array.isArray(originalProceedingData.argumentDetails) 
        ? originalProceedingData.argumentDetails 
        : [originalProceedingData.argumentDetails]
      entries.forEach(entry => {
        if (entry.attachment) filesToDeleteList.push(entry.attachment)
      })
    } else if (oldType === 'ANY_OTHER' && originalProceedingData.anyOtherDetails) {
      const entries = Array.isArray(originalProceedingData.anyOtherDetails) 
        ? originalProceedingData.anyOtherDetails 
        : [originalProceedingData.anyOtherDetails]
      entries.forEach(entry => {
        if (entry.attachment) filesToDeleteList.push(entry.attachment)
      })
    }

    // Delete decision details file if it exists
    if (originalProceedingData.decisionDetails?.attachment) {
      filesToDeleteList.push(originalProceedingData.decisionDetails.attachment)
    }

    // Delete order of proceeding file if it exists
    if (originalProceedingData.orderOfProceedingFilename) {
      filesToDeleteList.push(originalProceedingData.orderOfProceedingFilename)
    }

    setFilesToDelete(filesToDeleteList)
    setProceedingTypeChanged(true)
    
    // Clear form fields for new type
    setFormData((prev) => ({
      ...prev,
      type: newType,
      noticeOfMotion: newType === 'NOTICE_OF_MOTION' || newType === 'TO_FILE_REPLY' ? [{
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
      }] : prev.noticeOfMotion,
      argumentDetails: newType === 'ARGUMENT' ? [{
        argumentBy: '',
        argumentWith: '',
        nextDateOfHearing: '',
      }] : prev.argumentDetails,
      anyOtherDetails: newType === 'ANY_OTHER' ? [{
        attendingOfficerDetails: '',
        officerDetails: { name: '', rank: '', mobile: '' },
        appearingAGDetails: '',
        details: '',
      }] : prev.anyOtherDetails,
      decisionDetails: {
        writStatus: undefined,
        dateOfDecision: '',
        decisionByCourt: '',
        remarks: '',
      },
    }))
    
    // Clear file states
    setOrderOfProceedingFile(null)
    setNoticeOfMotionFiles(new Map())
    setReplyTrackingFiles(new Map())
    setArgumentFiles(new Map())
    setAnyOtherFiles(new Map())
    setDecisionDetailsFile(null)
  }

  async function handleProceedingUpdate(event: React.FormEvent) {
    event.preventDefault()
    if (!proceedingId || !formData.fir || !formData.hearingDetails.dateOfHearing) {
      setError('Please fill in required fields (Hearing Date)')
      return
    }

    if (!user?.token) {
      setError('Authentication required')
      return
    }

    // Show confirmation modal
    setShowConfirmModal(true)
  }

  async function confirmProceedingUpdate() {
    if (!proceedingId || !formData.fir || !formData.hearingDetails.dateOfHearing) {
      setError('Please fill in required fields (Hearing Date)')
      setShowConfirmModal(false)
      return
    }

    if (!user?.token) {
      setError('Authentication required')
      setShowConfirmModal(false)
      return
    }

    try {
      setError(null)
      setIsUpdating(true)

      // Validate file if present
      if (orderOfProceedingFile) {
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
        if (!allowedTypes.includes(orderOfProceedingFile.type)) {
          setError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
          setShowConfirmModal(false)
          return
        }
      }

      const payload: CreateProceedingInput = {
        fir: formData.fir,
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

      await updateProceeding(
        proceedingId,
        payload, 
        orderOfProceedingFile || undefined,
        Object.keys(attachmentFiles).length > 0 ? attachmentFiles : undefined,
        filesToDelete.length > 0 ? filesToDelete : undefined
      )
      
      // Navigate back to proceeding detail page
      setIsUpdating(false)
      setShowConfirmModal(false)
      navigate(`/proceedings/${proceedingId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update proceeding')
      setIsUpdating(false)
      setShowConfirmModal(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-gray-500">
        Loading proceeding for editing…
      </div>
    )
  }

  if (error && !originalProceedingData) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
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

  if (!originalProceedingData || !fir) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center text-gray-500">
        Proceeding or FIR not found
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate(`/proceedings/${proceedingId}`)}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            ← Back to Proceeding
          </button>
          <h1 className="mt-2 text-3xl font-semibold text-gray-900">
            Update Proceeding Form
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Update proceeding details below
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-6">
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        
        <form id="proceeding-edit-form" onSubmit={handleProceedingUpdate} className="space-y-6">
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
                  handleProceedingTypeChange(newType)
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
              {proceedingTypeChanged && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  <strong>Warning:</strong> Changing the proceeding type will delete all files and data associated with the previous type. This action cannot be undone.
                </div>
              )}
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
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {entry.attendanceMode === 'BY_FORMAT' 
                            ? 'Upload Doc of Proceeding (PDF, PNG, JPEG, JPG, Excel)' 
                            : 'Upload Files (Person) (PDF, PNG, JPEG, JPG, Excel)'}
                        </label>
                        <input
                          type="file"
                          id={`notice-of-motion-file-edit-${index}`}
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
                            <span className="font-medium text-indigo-700">New file: {noticeOfMotionFiles.get(index)?.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setNoticeOfMotionFiles(prev => {
                                  const newMap = new Map(prev)
                                  newMap.delete(index)
                                  return newMap
                                })
                                const fileInput = document.getElementById(`notice-of-motion-file-edit-${index}`) as HTMLInputElement
                                if (fileInput) fileInput.value = ''
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {originalProceedingData && originalProceedingData.type === 'NOTICE_OF_MOTION' && (() => {
                          const entries = originalProceedingData.noticeOfMotion
                            ? (Array.isArray(originalProceedingData.noticeOfMotion) ? originalProceedingData.noticeOfMotion : [originalProceedingData.noticeOfMotion])
                            : []
                          const entry = entries[index]
                          const existingFile = entry?.attachment
                          return existingFile && !noticeOfMotionFiles.get(index) ? (
                            <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
                              <span className="text-sm text-gray-700">Current file:</span>
                              <span className="flex-1 text-sm font-medium text-gray-900">{existingFile}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (existingFile) {
                                    setFilesToDelete(prev => [...prev, existingFile])
                                  }
                                }}
                                className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>
                          ) : null
                        })()}
                      </div>
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
                            id={`order-of-proceeding-file-edit-reply-${index}`}
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
                                  const fileInput = document.getElementById(`order-of-proceeding-file-edit-reply-${index}`) as HTMLInputElement
                                  if (fileInput) fileInput.value = ''
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {originalProceedingData && originalProceedingData.type === 'TO_FILE_REPLY' && (() => {
                            const entries = originalProceedingData.replyTracking
                              ? (Array.isArray(originalProceedingData.replyTracking) ? originalProceedingData.replyTracking : [originalProceedingData.replyTracking])
                              : []
                            const entry = entries[index]
                            const existingFile = entry?.attachment
                            return existingFile && !replyTrackingFiles.get(index) ? (
                              <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
                                <span className="text-sm text-gray-700">Current file:</span>
                                <span className="flex-1 text-sm font-medium text-gray-900">{existingFile}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (existingFile) {
                                      setFilesToDelete(prev => [...prev, existingFile])
                                    }
                                  }}
                                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null
                          })()}
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
                            id={`argument-file-edit-${index}`}
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
                                  const fileInput = document.getElementById(`argument-file-edit-${index}`) as HTMLInputElement
                                  if (fileInput) fileInput.value = ''
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {originalProceedingData && originalProceedingData.type === 'ARGUMENT' && (() => {
                            const entries = originalProceedingData.argumentDetails
                              ? (Array.isArray(originalProceedingData.argumentDetails) ? originalProceedingData.argumentDetails : [originalProceedingData.argumentDetails])
                              : []
                            const entry = entries[index]
                            const existingFile = entry?.attachment
                            return existingFile && !argumentFiles.get(index) ? (
                              <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
                                <span className="text-sm text-gray-700">Current file:</span>
                                <span className="flex-1 text-sm font-medium text-gray-900">{existingFile}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (existingFile) {
                                      setFilesToDelete(prev => [...prev, existingFile])
                                    }
                                  }}
                                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null
                          })()}
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
                            id={`any-other-file-edit-${index}`}
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
                                  const fileInput = document.getElementById(`any-other-file-edit-${index}`) as HTMLInputElement
                                  if (fileInput) fileInput.value = ''
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {originalProceedingData && originalProceedingData.type === 'ANY_OTHER' && (() => {
                            const entries = originalProceedingData.anyOtherDetails
                              ? (Array.isArray(originalProceedingData.anyOtherDetails) ? originalProceedingData.anyOtherDetails : [originalProceedingData.anyOtherDetails])
                              : []
                            const entry = entries[index]
                            const existingFile = entry?.attachment
                            return existingFile && !anyOtherFiles.get(index) ? (
                              <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
                                <span className="text-sm text-gray-700">Current file:</span>
                                <span className="flex-1 text-sm font-medium text-gray-900">{existingFile}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (existingFile) {
                                      setFilesToDelete(prev => [...prev, existingFile])
                                    }
                                  }}
                                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                                >
                                  Remove
                                </button>
                              </div>
                            ) : null
                          })()}
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
          </div>

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
                    id="order-of-proceeding-file-edit"
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
                      <span className="font-medium text-indigo-700">New file: {orderOfProceedingFile.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setOrderOfProceedingFile(null)
                          const fileInput = document.getElementById('order-of-proceeding-file-edit') as HTMLInputElement
                          if (fileInput) fileInput.value = ''
                        }}
                        className="text-red-600 hover:text-red-700"
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {originalProceedingData?.orderOfProceedingFilename && !orderOfProceedingFile && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
                      <span className="text-sm text-gray-700">Current file:</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">{originalProceedingData.orderOfProceedingFilename}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (originalProceedingData.orderOfProceedingFilename) {
                            setFilesToDelete(prev => [...prev, originalProceedingData.orderOfProceedingFilename!])
                          }
                        }}
                        className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {originalProceedingData?.decisionDetails?.attachment && !decisionDetailsFile && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
                      <span className="text-sm text-gray-700">Decision Details file:</span>
                      <span className="flex-1 text-sm font-medium text-gray-900">{originalProceedingData.decisionDetails.attachment}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (originalProceedingData.decisionDetails?.attachment) {
                            setFilesToDelete(prev => [...prev, originalProceedingData.decisionDetails!.attachment!])
                          }
                        }}
                        className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                      >
                        Remove
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
              onClick={() => navigate(`/proceedings/${proceedingId}`)}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              UPDATE PROCEEDING
            </button>
          </div>
        </form>
      </section>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-20">
          <div className="rounded-lg bg-white p-6 shadow-xl max-w-2xl w-full mx-4">
            {isUpdating ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                <p className="text-sm font-medium text-gray-700">Updating proceeding...</p>
                <p className="text-xs text-gray-500 mt-2">Please wait while we save your changes</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Update</h3>
                <div className="space-y-3 mb-6">
                  <p className="text-sm text-gray-700">
                    Are you sure you want to update this proceeding? This action will:
                  </p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 ml-4">
                    <li>Update all proceeding details</li>
                    {proceedingTypeChanged && (
                      <li className="text-amber-700 font-medium">
                        Delete all files and data from the previous proceeding type
                      </li>
                    )}
                    {filesToDelete.length > 0 && (
                      <li className="text-amber-700 font-medium">
                        Delete {filesToDelete.length} file(s) that are no longer needed
                      </li>
                    )}
                  </ul>
                  {proceedingTypeChanged && (
                    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                      <strong>Warning:</strong> This action cannot be undone. All data and files from the previous proceeding type will be permanently deleted.
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmProceedingUpdate}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Confirm Update
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
