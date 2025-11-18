import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Appeal, AuthUser, Hearing } from './types'
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentUser: null,
      setAuth: (user) => set({ currentUser: user }),
      logout: () => set({ currentUser: null }),
    }),
    { name: 'appealtrax-auth' }
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
    { name: 'appealtrax-appeals' }
  )
)


