import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Appeal, AuthUser, Hearing, FIR, FIRDashboardMetrics, FIRCityBreakdown, Proceeding } from './types'
import { format } from 'date-fns'

function generateId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

interface AuthState {
  currentUser: AuthUser | null
  setAuth: (user: AuthUser) => void
  logout: () => void
}

interface AppealsState {
  appeals: Appeal[]
  createAppeal: (input: Omit<Appeal, 'id' | 'hearings'>) => string
  updateAppeal: (id: string, update: Partial<Appeal>) => void
  addHearing: (appealId: string, hearing: Omit<Hearing, 'id'>) => string
  updateHearing: (appealId: string, hearingId: string, update: Partial<Hearing>) => void
}

interface CacheEntry<T> {
  data: T
  timestamp: number
}

interface ApiCacheState {
  // Cache entries with timestamps
  firs: CacheEntry<FIR[]> | null
  firDetails: Record<string, CacheEntry<FIR>>
  proceedings: CacheEntry<Proceeding[]> | null
  proceedingsByFIR: Record<string, CacheEntry<Proceeding[]>>
  dashboard: CacheEntry<FIRDashboardMetrics> | null
  cityGraph: CacheEntry<FIRCityBreakdown[]> | null
  
  // Cache management functions
  setFirs: (data: FIR[]) => void
  setFIRDetail: (id: string, data: FIR) => void
  setProceedings: (data: Proceeding[]) => void
  setProceedingsByFIR: (firId: string, data: Proceeding[]) => void
  setDashboard: (data: FIRDashboardMetrics) => void
  setCityGraph: (data: FIRCityBreakdown[]) => void
  
  // Get cached data if fresh (within 5 minutes)
  getCachedFirs: () => FIR[] | null
  getCachedFIRDetail: (id: string) => FIR | null
  getCachedProceedings: () => Proceeding[] | null
  getCachedProceedingsByFIR: (firId: string) => Proceeding[] | null
  getCachedDashboard: () => FIRDashboardMetrics | null
  getCachedCityGraph: () => FIRCityBreakdown[] | null
  
  // Clear cache (useful on logout or manual refresh)
  clearCache: () => void
  invalidateFIR: (firId: string) => void
  invalidateAllFirs: () => void
  invalidateProceedings: () => void
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      setAuth: (user) => set({ currentUser: user }),
      logout: () => {
        set({ currentUser: null })
        // Clear API cache on logout
        useApiCacheStore.getState().clearCache()
      },
    }),
    { name: 'writtrax-auth' }
  )
)

const seedAppeals: Appeal[] = [
  {
    id: generateId('apl'),
    title: 'State vs John Doe - Appeal',
    caseNumber: 'A-2025-001',
    appellant: 'State',
    respondent: 'John Doe',
    court: 'High Court',
    filedOn: format(new Date(), 'yyyy-MM-dd'),
    status: 'in-hearing',
    description: 'Appeal against lower court conviction',
    hearings: [
      {
        id: generateId('hrg'),
        date: format(new Date(), 'yyyy-MM-dd'),
        judge: 'Justice Rao',
        courtroom: '2B',
        status: 'scheduled',
        notes: 'Set for preliminary submissions',
      },
    ],
  },
]

export const useAppealsStore = create<AppealsState>()(
  persist(
    (set, get) => ({
      appeals: seedAppeals,
      createAppeal: (input) => {
        const id = generateId('apl')
        const next: Appeal = { ...input, id, hearings: [] }
        set({ appeals: [next, ...get().appeals] })
        return id
      },
      updateAppeal: (id, update) => {
        set({
          appeals: get().appeals.map((a) => (a.id === id ? { ...a, ...update } : a)),
        })
      },
      addHearing: (appealId, hearing) => {
        const id = generateId('hrg')
        set({
          appeals: get().appeals.map((a) =>
            a.id === appealId ? { ...a, hearings: [{ ...hearing, id }, ...a.hearings] } : a
          ),
        })
        return id
      },
      updateHearing: (appealId, hearingId, update) => {
        set({
          appeals: get().appeals.map((a) =>
            a.id === appealId
              ? {
                  ...a,
                  hearings: a.hearings.map((h) => (h.id === hearingId ? { ...h, ...update } : h)),
                }
              : a
          ),
        })
      },
    }),
    { name: 'writtrax-appeals' }
  )
)

// API Cache Store
export const useApiCacheStore = create<ApiCacheState>()(
  persist(
    (set, get) => ({
      firs: null,
      firDetails: {},
      proceedings: null,
      proceedingsByFIR: {},
      dashboard: null,
      cityGraph: null,

      setFirs: (data: FIR[]) => {
        set({ firs: { data, timestamp: Date.now() } })
      },

      setFIRDetail: (id: string, data: FIR) => {
        set((state) => ({
          firDetails: {
            ...state.firDetails,
            [id]: { data, timestamp: Date.now() },
          },
        }))
      },

      setProceedings: (data: Proceeding[]) => {
        set({ proceedings: { data, timestamp: Date.now() } })
      },

      setProceedingsByFIR: (firId: string, data: Proceeding[]) => {
        set((state) => ({
          proceedingsByFIR: {
            ...state.proceedingsByFIR,
            [firId]: { data, timestamp: Date.now() },
          },
        }))
      },

      setDashboard: (data: FIRDashboardMetrics) => {
        set({ dashboard: { data, timestamp: Date.now() } })
      },

      setCityGraph: (data: FIRCityBreakdown[]) => {
        set({ cityGraph: { data, timestamp: Date.now() } })
      },

      getCachedFirs: () => {
        const entry = get().firs
        if (!entry) return null
        const age = Date.now() - entry.timestamp
        return age < CACHE_TTL ? entry.data : null
      },

      getCachedFIRDetail: (id: string) => {
        const entry = get().firDetails[id]
        if (!entry) return null
        const age = Date.now() - entry.timestamp
        return age < CACHE_TTL ? entry.data : null
      },

      getCachedProceedings: () => {
        const entry = get().proceedings
        if (!entry) return null
        const age = Date.now() - entry.timestamp
        return age < CACHE_TTL ? entry.data : null
      },

      getCachedProceedingsByFIR: (firId: string) => {
        const entry = get().proceedingsByFIR[firId]
        if (!entry) return null
        const age = Date.now() - entry.timestamp
        return age < CACHE_TTL ? entry.data : null
      },

      getCachedDashboard: () => {
        const entry = get().dashboard
        if (!entry) return null
        const age = Date.now() - entry.timestamp
        return age < CACHE_TTL ? entry.data : null
      },

      getCachedCityGraph: () => {
        const entry = get().cityGraph
        if (!entry) return null
        const age = Date.now() - entry.timestamp
        return age < CACHE_TTL ? entry.data : null
      },

      clearCache: () => {
        set({
          firs: null,
          firDetails: {},
          proceedings: null,
          proceedingsByFIR: {},
          dashboard: null,
          cityGraph: null,
        })
      },

      invalidateFIR: (firId: string) => {
        set((state) => {
          const newFirDetails = { ...state.firDetails }
          delete newFirDetails[firId]
          const newProceedingsByFIR = { ...state.proceedingsByFIR }
          delete newProceedingsByFIR[firId]
          return {
            firDetails: newFirDetails,
            proceedingsByFIR: newProceedingsByFIR,
            firs: null, // Invalidate all FIRs list too
          }
        })
      },

      invalidateAllFirs: () => {
        set({
          firs: null,
          firDetails: {},
          proceedingsByFIR: {},
        })
      },

      invalidateProceedings: () => {
        set({
          proceedings: null,
        })
      },
    }),
    { name: 'writtrax-api-cache' }
  )
)


