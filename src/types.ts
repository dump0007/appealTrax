export interface AuthUser {
  email: string
  token: string
}

export type HearingStatus = 'scheduled' | 'completed' | 'adjourned' | 'cancelled'

export interface Hearing {
  id: string
  date: string // ISO date
  judge?: string
  courtroom?: string
  notes?: string
  status: HearingStatus
}

export type AppealStatus = 'draft' | 'filed' | 'in-hearing' | 'judgment' | 'closed'

export interface Appeal {
  id: string
  title: string
  caseNumber: string
  appellant: string
  respondent: string
  court: string
  filedOn: string // ISO date
  status: AppealStatus
  assignedToUserId?: string
  investigatingOfficerId?: string
  description?: string
  hearings: Hearing[]
}

export type FIRStatus =
  | 'REGISTERED'
  | 'UNDER_INVESTIGATION'
  | 'ONGOING_HEARING'
  | 'CHARGESHEET_FILED'
  | 'CLOSED'
  | 'WITHDRAWN'

export type WritType =
  | 'BAIL'
  | 'QUASHING'
  | 'DIRECTION'
  | 'SUSPENSION_OF_SENTENCE'
  | 'PAYROLL'
  | 'ANY_OTHER'

export type BailSubType = 'ANTICIPATORY' | 'REGULAR'

export interface RespondentDetail {
  name: string
  designation?: string
}

export interface InvestigatingOfficerDetail {
  name: string
  rank: string
  posting: string
  contact: number
  from?: string | null
  to?: string | null
}

export interface FIR {
  _id: string
  firNumber: string
  title?: string
  description?: string
  dateOfFIR: string
  dateOfFiling?: string
  branchName: string
  branch?: string
  writNumber: string
  writType: WritType
  writYear: number
  writSubType?: BailSubType | null
  writTypeOther?: string | null
  underSection: string
  act: string
  policeStation: string
  sections?: string[]
  investigatingOfficers: InvestigatingOfficerDetail[]
  // Legacy fields for backward compatibility
  investigatingOfficer?: string
  investigatingOfficerRank?: string
  investigatingOfficerPosting?: string
  investigatingOfficerContact?: number
  investigatingOfficerFrom?: string | null
  investigatingOfficerTo?: string | null
  petitionerName: string
  petitionerFatherName: string
  petitionerAddress: string
  petitionerPrayer: string
  respondents: (RespondentDetail | string)[]
  status: FIRStatus | string
  createdAt: string
  updatedAt: string
  proceedings?: Proceeding[]
}

export interface FIRStatusCount {
  status: FIRStatus | string
  count: number
}

export interface FIRDashboardMetrics {
  totalCases: number
  closedCases: number
  ongoingCases: number
  statusCounts: FIRStatusCount[]
}

export interface FIRCityBreakdown {
  branch: string
  count: number
}

export type ProceedingType =
  | 'NOTICE_OF_MOTION'
  | 'TO_FILE_REPLY'
  | 'ARGUMENT'
  | 'ANY_OTHER'

export type CourtAttendanceMode = 'BY_FORMAT' | 'BY_PERSON'

export type WritStatus = 'ALLOWED' | 'PENDING' | 'DISMISSED' | 'WITHDRAWN' | 'DIRECTION'

export interface PersonDetails {
  name: string
  rank?: string
  mobile?: string
}

export interface ProceedingHearingDetails {
  dateOfHearing: string
  judgeName: string
  courtNumber: string
}

export interface NoticeOfMotionDetails {
  attendanceMode: CourtAttendanceMode
  formatSubmitted?: boolean
  formatFilledBy?: PersonDetails
  appearingAG?: PersonDetails // Legacy - for BY_PERSON mode (deprecated, use appearingAGDetails)
  appearingAGDetails?: string // For BY_PERSON mode
  aagDgWhoWillAppear?: string // For BY_FORMAT mode
  attendingOfficer?: PersonDetails // Legacy - for BY_PERSON mode (deprecated, use attendingOfficerDetails)
  attendingOfficerDetails?: string // For BY_PERSON mode
  investigatingOfficer?: PersonDetails
  investigatingOfficerName?: string // For TO_FILE_REPLY mode - single name field
  nextDateOfHearing?: string
  details?: string // Details of proceeding
  officerDeputedForReply?: string
  vettingOfficerDetails?: string
  replyFiled?: boolean
  replyFilingDate?: string
  advocateGeneralName?: string
  replyScrutinizedByHC?: boolean
  // ReplyTracking fields for TO_FILE_REPLY entries (per entry)
  proceedingInCourt?: string
  orderInShort?: string
  nextActionablePoint?: string
  nextDateOfHearingReply?: string // Next date of hearing for reply tracking
}

export interface ReplyTrackingDetails {
  proceedingInCourt?: string
  orderInShort?: string
  nextActionablePoint?: string
  nextDateOfHearing?: string
}

export interface ArgumentDetails {
  argumentBy?: string // Argument by
  argumentWith?: string // Argument with
  nextDateOfHearing?: string
}

export interface AnyOtherDetails {
  attendingOfficerDetails?: string // Details of Officer who is attending
  officerDetails?: PersonDetails // Details of officer (Name, Rank, Mobile)
  appearingAGDetails?: string // Details of AG who is appearing
  details?: string // Details of proceeding
}

export interface DecisionDetails {
  writStatus?: WritStatus // Writ status
  dateOfDecision?: string // Date of Decision
  decisionByCourt?: string // Decision by Court
  remarks?: string // Remarks
}

export interface Proceeding {
  _id: string
  fir: string | FIR
  sequence?: number
  type: ProceedingType
  summary?: string
  details?: string
  hearingDetails?: ProceedingHearingDetails
  noticeOfMotion?: NoticeOfMotionDetails | NoticeOfMotionDetails[] // Support both single and array
  replyTracking?: ReplyTrackingDetails
  argumentDetails?: ArgumentDetails | ArgumentDetails[] // Support both single and array
  anyOtherDetails?: AnyOtherDetails[]
  createdBy?: string
  draft?: boolean
  attachments?: Array<{ fileName: string; fileUrl: string }>
  orderOfProceedingFilename?: string // Filename of uploaded order of proceeding
  createdAt?: string
  updatedAt?: string
}

export interface CreateProceedingInput {
  fir: string // FIR ID
  type: ProceedingType
  summary?: string
  details?: string
  hearingDetails: ProceedingHearingDetails
  noticeOfMotion?: NoticeOfMotionDetails | NoticeOfMotionDetails[] // Support both single and array
  replyTracking?: ReplyTrackingDetails
  argumentDetails?: ArgumentDetails | ArgumentDetails[] // Support both single and array
  anyOtherDetails?: AnyOtherDetails[]
  decisionDetails?: DecisionDetails
  createdBy?: string // Officer ID (optional - backend sets it from JWT token)
  draft?: boolean // Whether this is a draft proceeding
  attachments?: Array<{ fileName: string; fileUrl: string }>
  orderOfProceedingFilename?: string // Filename of uploaded order of proceeding
}

export interface CreateFIRInput {
  firNumber: string
  branchName: string
  writNumber: string
  writType: WritType
  writYear: number
  writSubType?: BailSubType | null
  writTypeOther?: string
  underSection: string
  act: string
  policeStation: string
  dateOfFIR: string
  sections?: string[]
  investigatingOfficers: InvestigatingOfficerDetail[]
  // Legacy fields for backward compatibility
  investigatingOfficer?: string
  investigatingOfficerRank?: string
  investigatingOfficerPosting?: string
  investigatingOfficerContact?: number
  investigatingOfficerFrom?: string
  investigatingOfficerTo?: string
  petitionerName: string
  petitionerFatherName: string
  petitionerAddress: string
  petitionerPrayer: string
  respondents: RespondentDetail[]
  status: FIRStatus
  linkedWrits?: string[]
  // title?: string // Commented out - using petitionerPrayer instead
  // description?: string // Commented out - using petitionerPrayer instead
}








