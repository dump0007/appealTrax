import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createFIR, createProceeding, fetchDraftProceedingByFIR, fetchFIRs } from '../lib/api'
import { useApiCacheStore } from '../store'
import type { BailSubType, CreateFIRInput, CreateProceedingInput, FIR, FIRStatus, InvestigatingOfficerDetail, RespondentDetail, WritType, ProceedingType, CourtAttendanceMode, WritStatus, NoticeOfMotionDetails } from '../types'

const STATUS_OPTIONS: FIRStatus[] = [
  'REGISTERED',
  'UNDER_INVESTIGATION',
  'ONGOING_HEARING',
  'CHARGESHEET_FILED',
  'CLOSED',
  'WITHDRAWN',
]

const WRIT_TYPE_OPTIONS: { label: string; value: WritType }[] = [
  { label: 'Bail', value: 'BAIL' },
  { label: 'Quashing', value: 'QUASHING' },
  { label: 'Direction', value: 'DIRECTION' },
  { label: 'Suspension of Sentence', value: 'SUSPENSION_OF_SENTENCE' },
  { label: 'Payroll', value: 'PAYROLL' },
  { label: 'Any Other', value: 'ANY_OTHER' },
]

const BAIL_SUB_TYPE_OPTIONS: { label: string; value: BailSubType }[] = [
  { label: 'Anticipatory', value: 'ANTICIPATORY' },
  { label: 'Regular', value: 'REGULAR' },
]

const CURRENT_YEAR = new Date().getFullYear()

const EMPTY_RESPONDENT: RespondentDetail = { name: '', designation: '' }
const EMPTY_IO: InvestigatingOfficerDetail = { name: '', rank: '', posting: '', contact: 0, from: '', to: '' }

const createInitialForm = (): CreateFIRInput => ({
  firNumber: '',
  branchName: '',
  writNumber: '',
  writType: 'BAIL',
  writYear: CURRENT_YEAR,
  writSubType: 'ANTICIPATORY',
  writTypeOther: '',
  underSection: '',
  act: '',
  policeStation: '',
  dateOfFIR: '',
  sections: [],
  investigatingOfficers: [{ ...EMPTY_IO }],
  petitionerName: '',
  petitionerFatherName: '',
  petitionerAddress: '',
  petitionerPrayer: '',
  respondents: [{ ...EMPTY_RESPONDENT }],
  status: 'REGISTERED',
  linkedWrits: [],
  // title: '', // Commented out - using petitionerPrayer instead
  // description: '', // Commented out - using petitionerPrayer instead
})

export default function FIRs() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [firs, setFirs] = useState<FIR[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formData, setFormData] = useState<CreateFIRInput>(createInitialForm())
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [branchFilter, setBranchFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const [listError, setListError] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [createdFIRId, setCreatedFIRId] = useState<string | null>(null)
  const [firsWithDrafts, setFirsWithDrafts] = useState<Set<string>>(new Set())
  const [proceedingFormData, setProceedingFormData] = useState({
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

  // Auto-open form if navigate from dashboard with create=true
  useEffect(() => {
    const shouldOpenForm = searchParams.get('create') === 'true'
    if (shouldOpenForm) {
      setFormOpen(true)
      // Clean up URL by removing query param
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('create')
      setSearchParams(newSearchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    async function load() {
      try {
        const cache = useApiCacheStore.getState()
        // Check cache first for instant loading
        const cachedFirs = cache.getCachedFirs()
        if (cachedFirs) {
          setFirs(cachedFirs)
          setLoading(false) // Show cached data immediately
        }

        // Fetch fresh data in the background
        setLoading(true)
        const data = await fetchFIRs()
        setFirs(data)
        
        // Check for drafts for each FIR
        const draftSet = new Set<string>()
        await Promise.all(
          data.map(async (fir) => {
            try {
              const draft = await fetchDraftProceedingByFIR(fir._id)
              if (draft) {
                draftSet.add(fir._id)
              }
            } catch {
              // Ignore errors when checking for drafts
            }
          })
        )
        setFirsWithDrafts(draftSet)
        setListError(null)
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Unable to fetch FIRs')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function handleResumeDraft(firId: string) {
    try {
      setFormSubmitting(true)
      setFormError(null)
      
      // Fetch the FIR and draft proceeding
      const fir = firs.find(f => f._id === firId)
      if (!fir) {
        setFormError('FIR not found')
        return
      }
      
      const draft = await fetchDraftProceedingByFIR(firId)
      if (!draft) {
        setFormError('Draft not found')
        return
      }
      
      // Set form data from FIR
      setFormData({
        firNumber: fir.firNumber,
        branchName: fir.branchName || '',
        writNumber: fir.writNumber || '',
        writType: fir.writType,
        writYear: fir.writYear || CURRENT_YEAR,
        writSubType: fir.writSubType || undefined,
        writTypeOther: fir.writTypeOther || '',
        underSection: fir.underSection || '',
        act: fir.act || '',
        policeStation: fir.policeStation || '',
        dateOfFIR: fir.dateOfFIR ? new Date(fir.dateOfFIR).toISOString().split('T')[0] : '',
        sections: fir.sections || [],
        investigatingOfficers: fir.investigatingOfficers || [{ ...EMPTY_IO }],
        petitionerName: fir.petitionerName || '',
        petitionerFatherName: fir.petitionerFatherName || '',
        petitionerAddress: fir.petitionerAddress || '',
        petitionerPrayer: fir.petitionerPrayer || '',
        respondents: (fir.respondents && Array.isArray(fir.respondents) 
          ? fir.respondents.filter(r => typeof r === 'object' && r !== null) as RespondentDetail[]
          : [{ ...EMPTY_RESPONDENT }]),
        status: fir.status as FIRStatus,
        // title: fir.title || '', // Commented out - using petitionerPrayer instead
        // description: fir.description || '', // Commented out - using petitionerPrayer instead
      })
      
      // Set proceeding form data from draft
      if (draft.hearingDetails) {
        // Convert noticeOfMotion to array if it's a single object
        let noticeOfMotionArray: NoticeOfMotionDetails[] = []
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

        if (draft.noticeOfMotion) {
          if (Array.isArray(draft.noticeOfMotion)) {
            noticeOfMotionArray = draft.noticeOfMotion.map(nom => ({
              attendanceMode: nom.attendanceMode || 'BY_FORMAT',
              formatSubmitted: nom.formatSubmitted || false,
              formatFilledBy: normalizePerson(nom.formatFilledBy),
              appearingAG: normalizePerson(nom.appearingAG),
              attendingOfficer: normalizePerson(nom.attendingOfficer),
              investigatingOfficer: normalizeInvestigatingOfficer(nom),
              nextDateOfHearing: formatDateInputValue(nom.nextDateOfHearing),
              officerDeputedForReply: nom.officerDeputedForReply || '',
              vettingOfficerDetails: nom.vettingOfficerDetails || '',
              replyFiled: nom.replyFiled || false,
              replyFilingDate: nom.replyFilingDate || '',
              advocateGeneralName: nom.advocateGeneralName || '',
              replyScrutinizedByHC: nom.replyScrutinizedByHC || false,
            }))
          } else {
            // Single object - convert to array
            const nom = draft.noticeOfMotion
            noticeOfMotionArray = [{
              attendanceMode: nom.attendanceMode || 'BY_FORMAT',
              formatSubmitted: nom.formatSubmitted || false,
              formatFilledBy: normalizePerson(nom.formatFilledBy),
              appearingAG: normalizePerson(nom.appearingAG),
              attendingOfficer: normalizePerson(nom.attendingOfficer),
              investigatingOfficer: normalizeInvestigatingOfficer(nom),
              nextDateOfHearing: formatDateInputValue(nom.nextDateOfHearing),
              officerDeputedForReply: nom.officerDeputedForReply || '',
              vettingOfficerDetails: nom.vettingOfficerDetails || '',
              replyFiled: nom.replyFiled || false,
              replyFilingDate: nom.replyFilingDate || '',
              advocateGeneralName: nom.advocateGeneralName || '',
              replyScrutinizedByHC: nom.replyScrutinizedByHC || false,
            }]
          }
        } else {
          noticeOfMotionArray = proceedingFormData.noticeOfMotion
        }

        setProceedingFormData({
          type: draft.type,
          summary: draft.summary || '',
          details: draft.details || '',
          hearingDetails: {
            dateOfHearing: draft.hearingDetails.dateOfHearing ? new Date(draft.hearingDetails.dateOfHearing).toISOString().split('T')[0] : '',
            judgeName: draft.hearingDetails.judgeName || '',
            courtNumber: draft.hearingDetails.courtNumber || '',
          },
          noticeOfMotion: noticeOfMotionArray,
          replyTracking: draft.replyTracking ? {
            proceedingInCourt: draft.replyTracking.proceedingInCourt || '',
            orderInShort: draft.replyTracking.orderInShort || '',
            nextActionablePoint: draft.replyTracking.nextActionablePoint || '',
            nextDateOfHearing: draft.replyTracking.nextDateOfHearing || '',
          } : proceedingFormData.replyTracking,
          argumentDetails: draft.argumentDetails ? {
            details: draft.argumentDetails.details || '',
            nextDateOfHearing: draft.argumentDetails.nextDateOfHearing || '',
          } : proceedingFormData.argumentDetails,
          decisionDetails: draft.decisionDetails ? {
            writStatus: draft.decisionDetails.writStatus || 'PENDING',
            remarks: draft.decisionDetails.remarks || '',
            decisionByCourt: draft.decisionDetails.decisionByCourt || '',
            dateOfDecision: draft.decisionDetails.dateOfDecision || '',
          } : proceedingFormData.decisionDetails,
        })
      }
      
      setCreatedFIRId(firId)
      setCurrentStep(2)
      setFormOpen(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load draft')
    } finally {
      setFormSubmitting(false)
    }
  }

  const filteredFirs = useMemo(() => {
    return firs.filter((fir) => {
      const searchHaystack = [
        fir.firNumber,
        fir.petitionerName,
        fir.branchName,
        fir.branch,
        fir.policeStation,
        fir.investigatingOfficer, // Legacy field
        fir.investigatingOfficers?.map(io => io.name).join(' '), // New array field
        fir.writNumber,
        fir.underSection,
        fir.act,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = !search || searchHaystack.includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || fir.status === statusFilter
      const branchValue = (fir.branchName || fir.branch || '').toLowerCase()
      const matchesBranch =
        !branchFilter || branchValue.includes(branchFilter.trim().toLowerCase())
      return matchesSearch && matchesStatus && matchesBranch
    })
  }, [firs, search, statusFilter, branchFilter])

  const visibleFirs = filteredFirs.slice(0, visibleCount)
  const canShowMore = filteredFirs.length > visibleCount

  function handleInputChange<K extends keyof CreateFIRInput>(key: K, value: CreateFIRInput[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function updateRespondent(index: number, key: keyof RespondentDetail, value: string) {
    setFormData((prev) => {
      const next = [...prev.respondents]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, respondents: next }
    })
  }

  function addRespondentRow() {
    setFormData((prev) => ({ ...prev, respondents: [...prev.respondents, { ...EMPTY_RESPONDENT }] }))
  }

  function removeRespondentRow(index: number) {
    setFormData((prev) => {
      if (prev.respondents.length === 1) {
        return prev
      }
      const next = prev.respondents.filter((_, i) => i !== index)
      return { ...prev, respondents: next.length ? next : [{ ...EMPTY_RESPONDENT }] }
    })
  }

  function updateIO(index: number, key: keyof InvestigatingOfficerDetail, value: string | number | null) {
    setFormData((prev) => {
      const next = [...prev.investigatingOfficers]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, investigatingOfficers: next }
    })
  }

  function addIORow() {
    setFormData((prev) => ({ ...prev, investigatingOfficers: [...prev.investigatingOfficers, { ...EMPTY_IO }] }))
  }

  function removeIORow(index: number) {
    setFormData((prev) => {
      if (prev.investigatingOfficers.length === 1) {
        return prev // Keep at least one
      }
      const next = prev.investigatingOfficers.filter((_, i) => i !== index)
      return { ...prev, investigatingOfficers: next }
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setFormSubmitting(true)
      setFormError(null)
      const respondents = formData.respondents
        .map((r) => ({
          name: r.name.trim(),
          designation: r.designation.trim(),
        }))
        .filter((r) => r.name && r.designation)

      if (respondents.length === 0) {
        setFormError('Please provide at least one respondent with name and designation.')
        setFormSubmitting(false)
        return
      }

      // Validate and clean investigatingOfficers array
      const investigatingOfficers = formData.investigatingOfficers
        .map((io) => ({
          name: io.name.trim(),
          rank: io.rank.trim(),
          posting: io.posting.trim(),
          contact: io.contact || 0,
          from: io.from && io.from.trim() ? io.from.trim() : null,
          to: io.to && io.to.trim() ? io.to.trim() : null,
        }))
        .filter((io) => io.name && io.rank && io.posting)

      if (investigatingOfficers.length === 0) {
        setFormError('Please provide at least one investigating officer with name, rank, and posting.')
        setFormSubmitting(false)
        return
      }

      const payload: CreateFIRInput = {
        ...formData,
        sections: formData.sections && formData.sections.length ? formData.sections : [formData.underSection],
        respondents,
        investigatingOfficers,
        linkedWrits: formData.linkedWrits?.filter((id) => id),
        writSubType: formData.writType === 'BAIL' ? formData.writSubType : null,
        writTypeOther: formData.writType === 'ANY_OTHER' ? formData.writTypeOther : undefined,
        investigatingOfficerContact: Number(formData.investigatingOfficerContact) || 0,
        investigatingOfficerFrom: formData.investigatingOfficerFrom || undefined,
        investigatingOfficerTo: formData.investigatingOfficerTo || undefined,
        // title: '', // Commented out - using petitionerPrayer instead
        // description: '', // Commented out - using petitionerPrayer instead
      }

      const newFIR = await createFIR(payload)
      // Cache is invalidated by createFIR, so fetch fresh list
      const freshData = await fetchFIRs()
      setFirs(freshData)
      
      // Move to Step 2 with the created FIR ID
      if (newFIR && newFIR._id) {
        setCreatedFIRId(newFIR._id)
        setCurrentStep(2)
        // Pre-fill proceeding form with FIR date
        setProceedingFormData(prev => ({
          ...prev,
          hearingDetails: {
            ...prev.hearingDetails,
            dateOfHearing: formData.dateOfFIR || '',
          },
        }))
      } else {
        setFormError('FIR created but could not proceed to next step. Please create proceeding manually.')
        setFormData(createInitialForm())
        setFormOpen(false)
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create FIR')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleSaveDraft() {
    if (!createdFIRId) {
      setFormError('FIR ID is missing. Please go back and try again.')
      return
    }

    try {
      setFormSubmitting(true)
      setFormError(null)

      // Validate file if present
      if (orderOfProceedingFile) {
        if (orderOfProceedingFile.size > 250 * 1024) {
          setFormError('File size exceeds 250 KB limit')
          setFormSubmitting(false)
          return
        }
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
        if (!allowedTypes.includes(orderOfProceedingFile.type)) {
          setFormError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
          setFormSubmitting(false)
          return
        }
      }

      const payload: CreateProceedingInput = {
        fir: createdFIRId,
        type: proceedingFormData.type,
        summary: proceedingFormData.summary || undefined,
        details: proceedingFormData.details || undefined,
        hearingDetails: {
          dateOfHearing: proceedingFormData.hearingDetails.dateOfHearing || new Date().toISOString().split('T')[0],
          judgeName: proceedingFormData.hearingDetails.judgeName || '',
          courtNumber: proceedingFormData.hearingDetails.courtNumber || '',
        },
        noticeOfMotion: proceedingFormData.type === 'NOTICE_OF_MOTION' || proceedingFormData.type === 'TO_FILE_REPLY' 
          ? (proceedingFormData.noticeOfMotion.length === 1 ? proceedingFormData.noticeOfMotion[0] : proceedingFormData.noticeOfMotion)
          : undefined,
        replyTracking: proceedingFormData.type === 'TO_FILE_REPLY' ? proceedingFormData.replyTracking : undefined,
        argumentDetails: proceedingFormData.type === 'ARGUMENT' ? proceedingFormData.argumentDetails : undefined,
        decisionDetails: proceedingFormData.type === 'DECISION' ? proceedingFormData.decisionDetails : undefined,
        draft: true, // Mark as draft
      }

      await createProceeding(payload, orderOfProceedingFile || undefined)
      // Close form but keep state for resuming
      setFormOpen(false)
      setCurrentStep(1)
      setOrderOfProceedingFile(null)
      // Refresh FIRs list
      const freshData = await fetchFIRs()
      setFirs(freshData)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save draft')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleProceedingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!createdFIRId) {
      setFormError('FIR ID is missing. Please go back and try again.')
      return
    }

    try {
      setFormSubmitting(true)
      setFormError(null)

      // Validate file if present
      if (orderOfProceedingFile) {
        if (orderOfProceedingFile.size > 250 * 1024) {
          setFormError('File size exceeds 250 KB limit')
          setFormSubmitting(false)
          return
        }
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
        if (!allowedTypes.includes(orderOfProceedingFile.type)) {
          setFormError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
          setFormSubmitting(false)
          return
        }
      }

      const payload: CreateProceedingInput = {
        fir: createdFIRId,
        type: proceedingFormData.type,
        summary: proceedingFormData.summary || undefined,
        details: proceedingFormData.details || undefined,
        hearingDetails: {
          dateOfHearing: proceedingFormData.hearingDetails.dateOfHearing,
          judgeName: proceedingFormData.hearingDetails.judgeName,
          courtNumber: proceedingFormData.hearingDetails.courtNumber,
        },
        noticeOfMotion: (proceedingFormData.type === 'NOTICE_OF_MOTION' || proceedingFormData.type === 'TO_FILE_REPLY')
          ? (proceedingFormData.noticeOfMotion.length === 1 ? proceedingFormData.noticeOfMotion[0] : proceedingFormData.noticeOfMotion)
          : undefined,
        replyTracking: proceedingFormData.type === 'TO_FILE_REPLY' ? proceedingFormData.replyTracking : undefined,
        argumentDetails: proceedingFormData.type === 'ARGUMENT' ? proceedingFormData.argumentDetails : undefined,
        decisionDetails: proceedingFormData.type === 'DECISION' ? proceedingFormData.decisionDetails : undefined,
        draft: false, // Final submission
      }

      await createProceeding(payload, orderOfProceedingFile || undefined)
      // Reset everything and close form
      setFormData(createInitialForm())
      setProceedingFormData({
        type: 'NOTICE_OF_MOTION',
        summary: '',
        details: '',
        hearingDetails: { dateOfHearing: '', judgeName: '', courtNumber: '' },
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
        decisionDetails: {
          writStatus: 'PENDING',
          remarks: '',
          decisionByCourt: '',
          dateOfDecision: '',
        },
        argumentDetails: {
          details: '',
          nextDateOfHearing: '',
        },
      })
      setOrderOfProceedingFile(null)
      setCreatedFIRId(null)
      setCurrentStep(1)
      setFormOpen(false)
      // Refresh FIRs list
      const freshData = await fetchFIRs()
      setFirs(freshData)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create proceeding')
    } finally {
      setFormSubmitting(false)
    }
  }

  function handleBackToStep1() {
    setCurrentStep(1)
  }

  function addNoticeOfMotionEntry() {
    setProceedingFormData((prev) => ({
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
    setProceedingFormData((prev) => ({
      ...prev,
      noticeOfMotion: prev.noticeOfMotion.filter((_, i) => i !== index),
    }))
  }

  function updateNoticeOfMotionEntry(index: number, field: keyof NoticeOfMotionDetails, value: any) {
    setProceedingFormData((prev) => {
      const updated = [...prev.noticeOfMotion]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, noticeOfMotion: updated }
    })
  }

  function updateNoticeOfMotionPerson(index: number, personType: 'formatFilledBy' | 'appearingAG' | 'attendingOfficer' | 'investigatingOfficer', field: 'name' | 'rank' | 'mobile', value: string) {
    setProceedingFormData((prev) => {
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
            <h1 className="text-2xl font-semibold text-gray-900">Writs</h1>
            <p className="text-sm text-gray-500">
              Create new writs and manage existing investigations in one place.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {formOpen ? 'Close Form' : 'Create New Writ'}
        </button>
      </div>

      {formOpen && (
        <section className="rounded-xl border bg-white p-6">
          {/* Step Indicator */}
          <div className="mb-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                currentStep >= 1 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-400'
              }`}>
                {currentStep > 1 ? (
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="text-sm font-semibold">1</span>
                )}
              </div>
              <div className="hidden sm:block">
                <div className={`text-sm font-medium ${currentStep >= 1 ? 'text-indigo-600' : 'text-gray-400'}`}>
                  Step 1: Application Details
                </div>
                <div className="text-xs text-gray-500">(6 Sections)</div>
              </div>
            </div>
            <div className={`h-0.5 w-16 ${currentStep >= 2 ? 'bg-indigo-600' : 'bg-gray-300'}`} />
            <div className="flex items-center gap-2">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                currentStep >= 2 ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 bg-white text-gray-400'
              }`}>
                <span className="text-sm font-semibold">2</span>
              </div>
              <div className="hidden sm:block">
                <div className={`text-sm font-medium ${currentStep >= 2 ? 'text-indigo-600' : 'text-gray-400'}`}>
                  Step 2: Proceedings & Decision Details
                </div>
                <div className="text-xs text-gray-500">(3 Sections)</div>
              </div>
            </div>
          </div>

          {currentStep === 1 ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Add New Writ Application</h2>
              <p className="text-sm text-gray-500">
                Capture branch, writ, FIR, officer, petitioner and respondent details exactly as filed in the application.
              </p>
              <form className="mt-4 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-base font-semibold text-gray-900">Section 1 · Name of Branch</h3>
              <p className="text-sm text-gray-500">Enter the name of the branch processing this writ application.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField
                  label="Name of Branch"
                  value={formData.branchName}
                  onChange={(value) => handleInputChange('branchName', value)}
                  required
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Section 2 · Writ Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  Type of Writ<span className="text-red-500 ml-1">*</span>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.writType}
                    onChange={(e) => {
                      const value = e.target.value as WritType
                      setFormData((prev) => ({
                        ...prev,
                        writType: value,
                        writSubType: value === 'BAIL' ? prev.writSubType || 'ANTICIPATORY' : undefined,
                        writTypeOther: value === 'ANY_OTHER' ? prev.writTypeOther : '',
                      }))
                    }}
                    required
                  >
                    {WRIT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField
                  label="Writ Number"
                  value={formData.writNumber}
                  onChange={(value) => handleInputChange('writNumber', value)}
                  required
                />
                <label className="text-sm font-medium text-gray-700">
                  Year<span className="text-red-500 ml-1">*</span>
                  <input
                    type="number"
                    min={1900}
                    max={3000}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.writYear}
                    onChange={(e) =>
                      handleInputChange('writYear', Number(e.target.value) || CURRENT_YEAR)
                    }
                    required
                  />
                </label>
                {formData.writType === 'BAIL' && (
                  <label className="text-sm font-medium text-gray-700">
                    Sub Type<span className="text-red-500 ml-1">*</span>
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                      value={formData.writSubType || 'ANTICIPATORY'}
                      onChange={(e) =>
                        handleInputChange('writSubType', e.target.value as BailSubType)
                      }
                      required
                    >
                      {BAIL_SUB_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {formData.writType === 'ANY_OTHER' && (
                  <TextField
                    label="Specify Writ Type"
                    value={formData.writTypeOther || ''}
                    onChange={(value) => handleInputChange('writTypeOther', value)}
                    required
                  />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Section 3 · FIR Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <TextField
                  label="FIR Number"
                  value={formData.firNumber}
                  onChange={(value) => handleInputChange('firNumber', value)}
                  required
                />
                <TextField
                  label="Under Section"
                  value={formData.underSection}
                  onChange={(value) => handleInputChange('underSection', value)}
                  required
                />
                <TextField
                  label="Act"
                  value={formData.act}
                  onChange={(value) => handleInputChange('act', value)}
                  required
                />
                <label className="text-sm font-medium text-gray-700">
                  Date of FIR<span className="text-red-500 ml-1">*</span>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.dateOfFIR}
                    onChange={(e) => handleInputChange('dateOfFIR', e.target.value)}
                    required
                  />
                </label>
                <TextField
                  label="Police Station"
                  value={formData.policeStation}
                  onChange={(value) => handleInputChange('policeStation', value)}
                  required
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">
                  Section 4 · Investigation Officer Details
                </h3>
                <button
                  type="button"
                  onClick={addIORow}
                  className="rounded-md border-2 border-purple-500 px-3 py-1.5 text-sm font-medium text-purple-600 hover:bg-purple-50"
                >
                  + ADD ANOTHER INVESTIGATION OFFICER
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">At least one investigating officer is required.</p>
              {formData.investigatingOfficers.map((io, index) => (
                <div key={index} className="mt-4 rounded-lg border border-gray-300 bg-gray-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Investigating Officer {index + 1}
                    </span>
                    {formData.investigatingOfficers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeIORow(index)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      label="Officer Name"
                      value={io.name}
                      onChange={(value) => updateIO(index, 'name', value)}
                      required
                    />
                    <TextField
                      label="Rank"
                      value={io.rank}
                      onChange={(value) => updateIO(index, 'rank', value)}
                      required
                    />
                    <TextField
                      label="Posting"
                      value={io.posting}
                      onChange={(value) => updateIO(index, 'posting', value)}
                      required
                    />
                    <label className="text-sm font-medium text-gray-700">
                      Contact Number<span className="text-red-500 ml-1">*</span>
                      <input
                        type="tel"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={io.contact || ''}
                        onChange={(e) =>
                          updateIO(index, 'contact', Number(e.target.value) || 0)
                        }
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      From (Date)
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={io.from || ''}
                        onChange={(e) => updateIO(index, 'from', e.target.value || null)}
                      />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      To (Date)
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={io.to || ''}
                        onChange={(e) => updateIO(index, 'to', e.target.value || null)}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Section 5 · Petitioner Details</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
              </div>
              <label className="mt-4 block text-sm font-medium text-gray-700">
                Address<span className="text-red-500 ml-1">*</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={3}
                  value={formData.petitionerAddress}
                  onChange={(e) => handleInputChange('petitionerAddress', e.target.value)}
                  required
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-gray-700">
                Prayer<span className="text-red-500 ml-1">*</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                  rows={3}
                  value={formData.petitionerPrayer}
                  onChange={(e) => handleInputChange('petitionerPrayer', e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Section 6 · Respondent Details</h3>
                  <p className="text-sm text-gray-500">
                    Add all respondents with their official designations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addRespondentRow}
                  className="rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  + Add Respondent
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {formData.respondents.map((respondent, index) => (
                  <div
                    key={index}
                    className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">Respondent #{index + 1}</span>
                      {formData.respondents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRespondentRow(index)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-medium text-gray-700">
                        Name<span className="text-red-500 ml-1">*</span>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={respondent.name}
                          onChange={(e) => updateRespondent(index, 'name', e.target.value)}
                          required
                        />
                      </label>
                      <label className="text-sm font-medium text-gray-700">
                        Designation<span className="text-red-500 ml-1">*</span>
                        <input
                          type="text"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={respondent.designation}
                          onChange={(e) => updateRespondent(index, 'designation', e.target.value)}
                          required
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900">Case Status</h3>
              <p className="text-sm text-gray-500">Maintain dashboard stats by tagging the right status.</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-gray-700">
                  FIR Status <span className="text-red-500 ml-1">*</span>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value as FIRStatus)}
                    required
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setFormData(createInitialForm())
                  setFormOpen(false)
                  setFormError(null)
                  setCurrentStep(1)
                  setCreatedFIRId(null)
                }}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                BACK
              </button>
              <button
                type="submit"
                disabled={formSubmitting}
                className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {formSubmitting ? 'Saving...' : 'NEXT'}
              </button>
            </div>
          </form>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900">Proceedings & Decision Details</h2>
              <p className="text-sm text-gray-500">
                Add proceeding details for the writ application you just created.
              </p>
              <form className="mt-4 space-y-6" onSubmit={handleProceedingSubmit}>
                {/* Section 1: Hearing Details */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Hearing Details</h3>
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm font-medium text-gray-700">
                      Date of Hearing <span className="text-red-500 ml-1">*</span>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={proceedingFormData.hearingDetails.dateOfHearing}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
                            ...prev,
                            hearingDetails: { ...prev.hearingDetails, dateOfHearing: e.target.value },
                          }))
                        }
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Name of Judge <span className="text-red-500 ml-1">*</span>
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={proceedingFormData.hearingDetails.judgeName}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
                            ...prev,
                            hearingDetails: { ...prev.hearingDetails, judgeName: e.target.value },
                          }))
                        }
                        placeholder="Name of Judge"
                        required
                      />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      Court Number <span className="text-red-500 ml-1">*</span>
                      <input
                        type="text"
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        value={proceedingFormData.hearingDetails.courtNumber}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
                            ...prev,
                            hearingDetails: { ...prev.hearingDetails, courtNumber: e.target.value },
                          }))
                        }
                        placeholder="Court Number"
                        required
                      />
                    </label>
                  </div>
                </div>

                {/* Section 2: Type of Proceeding (simplified for now) */}
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Type of Proceeding</h3>
                  <label className="mb-4 block text-sm font-medium text-gray-700">
                    Select Type <span className="text-red-500 ml-1">*</span>
                    <select
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                      value={proceedingFormData.type}
                      onChange={(e) =>
                        setProceedingFormData((prev) => ({ ...prev, type: e.target.value as ProceedingType }))
                      }
                      required
                    >
                      <option value="NOTICE_OF_MOTION">Notice of Motion</option>
                      <option value="TO_FILE_REPLY">Reply Tracking</option>
                      <option value="ARGUMENT">Argument</option>
                      <option value="DECISION">Decision</option>
                    </select>
                  </label>
                  {proceedingFormData.type === 'NOTICE_OF_MOTION' && (
                    <div className="space-y-6">
                      {proceedingFormData.noticeOfMotion.map((entry, index) => (
                        <div key={index} className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
                          <div className="mb-4 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-700">
                              Notice of Motion Entry #{index + 1}
                            </h4>
                            {proceedingFormData.noticeOfMotion.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeNoticeOfMotionEntry(index)}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                              How Court is attended <span className="text-red-500 ml-1">*</span>
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
                                <label className="block text-sm font-medium text-gray-700">
                                  Whether format is duly filled and submitted <span className="text-red-500 ml-1">*</span>
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
                                <label className="block text-sm font-medium text-gray-700">
                                  Details of officer who has filled it <span className="text-red-500 ml-1">*</span>
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
                                <label className="block text-sm font-medium text-gray-700">
                                  Details of AG who is appearing <span className="text-red-500 ml-1">*</span>
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
                                <label className="block text-sm font-medium text-gray-700">
                                  Details of IO investigating officer <span className="text-red-500 ml-1">*</span>
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
                                <label className="block text-sm font-medium text-gray-700">
                                  Details of Officer who is attending <span className="text-red-500 ml-1">*</span>
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
                                <label className="block text-sm font-medium text-gray-700">
                                  Details of AG who is appearing <span className="text-red-500 ml-1">*</span>
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
                            <label className="block text-sm font-medium text-gray-700">
                              Next date of hearing <span className="text-red-500 ml-1">*</span>
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
                  {proceedingFormData.type === 'TO_FILE_REPLY' && (
                    <p className="text-sm text-gray-500">Additional fields for this proceeding type will be added here.</p>
                  )}
                  {proceedingFormData.type === 'ARGUMENT' && (
                    <div className="space-y-4 rounded-lg border border-purple-200 bg-white p-4">
                      <label className="text-sm font-medium text-gray-700">
                        Argument details <span className="text-red-500 ml-1">*</span>
                        <textarea
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          rows={3}
                          value={proceedingFormData.argumentDetails.details}
                          onChange={(e) =>
                            setProceedingFormData((prev) => ({
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
                        Next date of hearing <span className="text-red-500 ml-1">*</span>
                        <input
                          type="date"
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                          value={formatDateInputValue(proceedingFormData.argumentDetails.nextDateOfHearing)}
                          onChange={(e) =>
                            setProceedingFormData((prev) => ({
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
                        value={proceedingFormData.decisionDetails.writStatus}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
                            ...prev,
                            decisionDetails: {
                              ...prev.decisionDetails,
                              writStatus: e.target.value as WritStatus,
                            },
                          }))
                        }
                        required
                      >
                        <option value="PENDING">Pending</option>
                        <option value="ALLOWED">Allowed</option>
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
                        value={proceedingFormData.decisionDetails.dateOfDecision}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
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
                        value={proceedingFormData.decisionDetails.decisionByCourt}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
                            ...prev,
                            decisionDetails: {
                              ...prev.decisionDetails,
                              decisionByCourt: e.target.value,
                            },
                          }))
                        }
                        placeholder="Decision by Court"
                      />
                    </label>
                    <label className="md:col-span-2 text-sm font-medium text-gray-700">
                      Remarks
                      <textarea
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                        rows={3}
                        value={proceedingFormData.decisionDetails.remarks}
                        onChange={(e) =>
                          setProceedingFormData((prev) => ({
                            ...prev,
                            decisionDetails: {
                              ...prev.decisionDetails,
                              remarks: e.target.value,
                            },
                          }))
                        }
                        placeholder="Remarks"
                      />
                    </label>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Upload Order of Proceeding
                        <span className="ml-1 text-xs text-gray-500">(PDF, PNG, JPEG, JPG, Excel - Max 250 KB)</span>
                      </label>
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          id="order-of-proceeding-file-firs"
                          type="file"
                          accept=".pdf,.png,.jpeg,.jpg,.xlsx,.xls"
                          className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              if (file.size > 250 * 1024) {
                                setFormError('File size exceeds 250 KB limit')
                                e.target.value = ''
                                return
                              }
                              const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
                              if (!allowedTypes.includes(file.type)) {
                                setFormError('Invalid file type. Only PDF, PNG, JPEG, JPG, and Excel files are allowed.')
                                e.target.value = ''
                                return
                              }
                              setOrderOfProceedingFile(file)
                              setFormError(null)
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
                                const fileInput = document.getElementById('order-of-proceeding-file-firs') as HTMLInputElement
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

                {formError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleBackToStep1}
                    className="text-sm font-medium text-indigo-600 hover:underline"
                  >
                    BACK
                  </button>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={formSubmitting}
                      className="rounded-md border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      {formSubmitting ? 'Saving...' : 'SAVE AND CLOSE'}
                    </button>
                    <button
                      type="submit"
                      disabled={formSubmitting}
                      className="rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {formSubmitting ? 'Submitting...' : 'FINAL SUBMIT'}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </section>
      )}

      {!formOpen && (
        <section className="rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">All Writs</h2>
            <p className="text-sm text-gray-500">
              {filteredFirs.length} record{filteredFirs.length === 1 ? '' : 's'} found
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search by WRIT #, petitioner, writ, branch..."
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
              placeholder="Filter by branch/unit"
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
                <th className="px-4 py-3">Writ Number</th>
                <th className="px-4 py-3">Petitioner</th>
                <th className="px-4 py-3">Section/Act</th>
                <th className="px-4 py-3">Investigating Officer</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Respondents</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date of FIR</th>
              </tr>
            </thead>
            <tbody className="divide-y text-sm text-gray-700">
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                    Loading writs…
                  </td>
                </tr>
              )}
              {!loading && visibleFirs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                    No writs match the selected filters.
                  </td>
                </tr>
              )}
              {visibleFirs.map((fir) => {
                const hasDraft = firsWithDrafts.has(fir._id)
                return (
                  <tr
                    key={fir._id}
                    className={`cursor-pointer transition ${hasDraft ? 'hover:bg-amber-50' : 'hover:bg-indigo-50'}`}
                    onClick={() => {
                      if (hasDraft) {
                        handleResumeDraft(fir._id)
                      } else {
                        navigate(`/firs/${fir._id}`)
                      }
                    }}
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{fir.firNumber}</span>
                        {hasDraft && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            Draft
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{fir.petitionerName || '—'}</div>
                      {fir.petitionerFatherName && (
                        <div className="text-xs text-gray-500">S/O {fir.petitionerFatherName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fir.underSection && String(fir.underSection).trim() ? (
                        <div className="font-medium text-gray-900">{fir.underSection}</div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                      {fir.act && String(fir.act).trim() && (
                        <div className="text-xs text-gray-500 mt-0.5">{fir.act}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {fir.investigatingOfficers && fir.investigatingOfficers.length > 0 ? (
                        <div>
                          <div className="font-medium text-gray-900">
                            {fir.investigatingOfficers[0].name || '—'}
                          </div>
                          {fir.investigatingOfficers[0].rank && (
                            <div className="text-xs text-gray-500">{fir.investigatingOfficers[0].rank}</div>
                          )}
                          {fir.investigatingOfficers.length > 1 && (
                            <div className="text-xs text-indigo-600">+{fir.investigatingOfficers.length - 1} more</div>
                          )}
                        </div>
                      ) : fir.investigatingOfficer ? (
                        <div className="text-gray-900">{fir.investigatingOfficer}</div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{fir.branchName || fir.branch || '—'}</td>
                    <td className="px-4 py-3">
                      {fir.respondents && Array.isArray(fir.respondents) && fir.respondents.length > 0 ? (
                        <div>
                          {fir.respondents.filter(r => r != null).slice(0, 2).map((respondent, idx) => {
                            let name = '—'
                            let designation: string | null = null
                            
                            if (typeof respondent === 'string') {
                              name = respondent.trim() || '—'
                            } else if (respondent && typeof respondent === 'object') {
                              const respObj = respondent as RespondentDetail
                              name = respObj.name ? String(respObj.name).trim() : '—'
                              designation = respObj.designation ? String(respObj.designation).trim() : null
                            }
                            
                            return (
                              <div key={idx} className={idx > 0 ? 'mt-1' : ''}>
                                <div className="font-medium text-gray-900">{name}</div>
                                {designation && (
                                  <div className="text-xs text-gray-500">{designation}</div>
                                )}
                              </div>
                            )
                          })}
                          {fir.respondents.filter(r => r != null).length > 2 && (
                            <div className="mt-1 text-xs text-indigo-600">+{fir.respondents.filter(r => r != null).length - 2} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        fir.status === 'CLOSED' || fir.status === 'DISMISSED'
                          ? 'bg-green-100 text-green-800'
                          : fir.status === 'PENDING' || fir.status === 'ONGOING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {formatStatusLabel(fir.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(fir.dateOfFIR || fir.dateOfFiling)}</td>
                </tr>
                )
              })}
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
      )}
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
  value: string | number
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}) {
  return (
    <label className="text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
      <input
        type="text"
        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
        value={value ?? ''}
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

