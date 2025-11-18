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

export interface FIR {
  _id: string
  firNumber: string
  title: string
  description: string
  dateOfFiling: string
  sections: string[]
  branch: string
  investigatingOfficer: string
  investigatingOfficerRank: string
  investigatingOfficerPosting: string
  investigatingOfficerContact: number
  petitionerName: string
  petitionerFatherName: string
  petitionerAddress: string
  petitionerPrayer: string
  respondents: string[]
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
  | 'DECISION'

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
  appearingAG?: PersonDetails
  attendingOfficer?: PersonDetails
  nextDateOfHearing?: string
  officerDeputedForReply?: string
  vettingOfficerDetails?: string
  replyFiled?: boolean
  replyFilingDate?: string
  advocateGeneralName?: string
  investigatingOfficerName?: string
  replyScrutinizedByHC?: boolean
}

export interface ReplyTrackingDetails {
  proceedingInCourt?: string
  orderInShort?: string
  nextActionablePoint?: string
  nextDateOfHearing?: string
}

export interface ArgumentDetails {
  nextDateOfHearing?: string
}

export interface DecisionDetails {
  writStatus: WritStatus
  remarks?: string
  decisionByCourt?: string
  dateOfDecision?: string
}

export interface Proceeding {
  _id: string
  fir: string | FIR
  sequence?: number
  type: ProceedingType
  summary?: string
  details?: string
  hearingDetails?: ProceedingHearingDetails
  noticeOfMotion?: NoticeOfMotionDetails
  replyTracking?: ReplyTrackingDetails
  argumentDetails?: ArgumentDetails
  decisionDetails?: DecisionDetails
  createdBy?: string
  attachments?: Array<{ fileName: string; fileUrl: string }>
  createdAt?: string
  updatedAt?: string
}

export interface CreateProceedingInput {
  fir: string // FIR ID
  type: ProceedingType
  summary?: string
  details?: string
  hearingDetails: ProceedingHearingDetails
  noticeOfMotion?: NoticeOfMotionDetails
  replyTracking?: ReplyTrackingDetails
  argumentDetails?: ArgumentDetails
  decisionDetails?: DecisionDetails
  createdBy?: string // Officer ID (optional - backend sets it from JWT token)
  attachments?: Array<{ fileName: string; fileUrl: string }>
}

export interface CreateFIRInput {
  firNumber: string
  title: string
  description: string
  dateOfFiling: string
  sections: string[]
  branch: string
  investigatingOfficer: string
  investigatingOfficerRank: string
  investigatingOfficerPosting: string
  investigatingOfficerContact: number
  petitionerName: string
  petitionerFatherName: string
  petitionerAddress: string
  petitionerPrayer: string
  respondents: string[]
  status: FIRStatus
  linkedWrits?: string[]
}








