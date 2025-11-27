import type {
  FIR,
  FIRCityBreakdown,
  FIRDashboardMetrics,
  CreateFIRInput,
  Proceeding,
  CreateProceedingInput,
} from '../types'
import { useAuthStore, useApiCacheStore } from '../store'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000'

interface AuthPayload {
  email: string
  password: string
}

interface AuthResponse {
  status: number
  logged: boolean
  token?: string
  message?: string
}

type MaybeStatusResponse = { status?: number; message?: string }

function getAuthToken(): string | null {
  const state = useAuthStore.getState()
  return state.currentUser?.token || null
}

function handleAuthError() {
  // Clear auth state
  const { logout } = useAuthStore.getState()
  logout()
  
  // Redirect to login page
  // Use window.location to ensure full page reload and clear any cached state
  const currentPath = window.location.pathname
  if (currentPath !== '/login') { // Removed '/signup' - signup disabled
    window.location.href = '/login'
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }
  
  // Don't redirect on auth endpoints - they're meant to be accessed without auth
  const isAuthEndpoint = path.startsWith('/auth/')
  
  // For protected routes (all /v1/* routes), always add token if available
  // If token is missing for protected routes, backend will reject and we'll handle it
  if (!isAuthEndpoint && token) {
    // Backend uses x-access-token header
    headers['x-access-token'] = token
  } else if (!isAuthEndpoint && !token) {
    // If no token for protected route, redirect immediately
    console.warn('[API] No token available for protected route:', path)
    handleAuthError()
    throw new Error('Authentication required. Please login again.')
  }

  const method = options.method || 'GET'
  console.log(`[API] ${method} ${API_BASE_URL}${path}`, { 
    headers: Object.keys(headers),
    hasToken: !!token 
  })

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    ...options,
  })

  let data: AuthResponse | Record<string, unknown> | unknown[]
  try {
    data = await response.json()
    console.log(`[API] Response:`, response.status, data)
  } catch (err) {
    console.error('[API] Failed to parse response:', err)
    // If it's an auth error (401/403) and we can't parse response, still handle auth error
    // But skip redirect for auth endpoints
    if (!isAuthEndpoint && (response.status === 401 || response.status === 403)) {
      handleAuthError()
    }
    throw new Error('Unable to parse server response')
  }

  // Handle authentication errors (401 Unauthorized, 403 Forbidden)
  // But skip redirect for auth endpoints (login/signup can fail without redirecting)
  if (!isAuthEndpoint && (response.status === 401 || response.status === 403)) {
    console.error('[API] Authentication error:', response.status)
    handleAuthError()
    const message =
      (data as MaybeStatusResponse)?.message || 
      response.status === 401 
        ? 'Your session has expired. Please login again.' 
        : 'Access forbidden. Please login again.'
    throw new Error(message)
  }

  if (!response.ok) {
    const message =
      (data as MaybeStatusResponse)?.message || `Request failed with status ${response.status}`
    console.error('[API] Request failed:', message)
    throw new Error(message)
  }

  // Check for status field only if it's an object (not an array)
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const maybeStatus = (data as MaybeStatusResponse).status
    // Only check status if it exists and is not 200
    if (typeof maybeStatus === 'number' && maybeStatus !== 200) {
      // Handle auth errors from status field as well
      // But skip redirect for auth endpoints
      if (!isAuthEndpoint && (maybeStatus === 401 || maybeStatus === 403)) {
        handleAuthError()
      }
      const message =
        (data as MaybeStatusResponse).message ||
        `Request failed with status ${maybeStatus}`
      console.error('[API] Status error:', message)
      throw new Error(message)
    }
  }

  return data as T
}

/* signupUser function commented out - signup functionality disabled
export async function signupUser(payload: AuthPayload) {
  const data = await request<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (!data.token) {
    throw new Error('Signup succeeded but no token was returned')
  }

  return data
}
*/

export async function loginUser(payload: AuthPayload) {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (!data.token) {
    throw new Error('Login succeeded but no token was returned')
  }

  return data
}

export async function fetchFIRs() {
  const data = await request<FIR[]>('/v1/firs')
  // Save to cache
  useApiCacheStore.getState().setFirs(data)
  return data
}

export async function fetchFIRDashboard() {
  const data = await request<FIRDashboardMetrics>('/v1/firs/dash')
  // Save to cache
  useApiCacheStore.getState().setDashboard(data)
  return data
}

export async function fetchFIRCityGraph() {
  const data = await request<FIRCityBreakdown[]>('/v1/firs/graph')
  // Save to cache
  useApiCacheStore.getState().setCityGraph(data)
  return data
}

export async function fetchFIRDetail(id: string) {
  const data = await request<FIR>(`/v1/firs/${id}`)
  // Save to cache
  useApiCacheStore.getState().setFIRDetail(id, data)
  return data
}

export async function searchFIRs(query: string) {
  // Search doesn't cache - it's dynamic
  return request<FIR[]>(`/v1/firs/search?q=${encodeURIComponent(query)}`)
}

export async function createFIR(payload: CreateFIRInput) {
  const data = await request<FIR>('/v1/firs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  // Invalidate FIRs cache since we added a new one
  useApiCacheStore.getState().invalidateAllFirs()
  return data
}

// Proceeding endpoints
export async function fetchAllProceedings() {
  const data = await request<Proceeding[]>('/v1/proceedings')
  // Save to cache
  useApiCacheStore.getState().setProceedings(data)
  return data
}

export async function fetchProceedingsByFIR(firId: string) {
  const data = await request<Proceeding[]>(`/v1/proceedings/fir/${firId}`)
  // Save to cache
  useApiCacheStore.getState().setProceedingsByFIR(firId, data)
  return data
}

export async function fetchDraftProceedingByFIR(firId: string) {
  const data = await request<Proceeding | null>(`/v1/proceedings/fir/${firId}/draft`)
  return data
}

export async function createProceeding(payload: CreateProceedingInput, file?: File) {
  const token = getAuthToken()
  if (!token) {
    throw new Error('Authentication required')
  }

  // Create FormData if file is present, otherwise use JSON
  const formData = new FormData()
  
  // Add all payload fields to FormData
  formData.append('fir', payload.fir)
  formData.append('type', payload.type)
  if (payload.summary) formData.append('summary', payload.summary)
  if (payload.details) formData.append('details', payload.details)
  formData.append('hearingDetails', JSON.stringify(payload.hearingDetails))
  
  if (payload.noticeOfMotion) {
    formData.append('noticeOfMotion', JSON.stringify(payload.noticeOfMotion))
  }
  if (payload.replyTracking) {
    formData.append('replyTracking', JSON.stringify(payload.replyTracking))
  }
  if (payload.argumentDetails) {
    formData.append('argumentDetails', JSON.stringify(payload.argumentDetails))
  }
  if (payload.decisionDetails) {
    formData.append('decisionDetails', JSON.stringify(payload.decisionDetails))
  }
  if (payload.draft !== undefined) {
    formData.append('draft', String(payload.draft))
  }
  
  // Add file if present
  if (file) {
    formData.append('orderOfProceeding', file)
  }

  const response = await fetch(`${API_BASE_URL}/v1/proceedings`, {
    method: 'POST',
    headers: {
      'x-access-token': token,
      // Don't set Content-Type - browser will set it with boundary for FormData
    },
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const message = errorData.message || `Request failed with status ${response.status}`
    
    // Handle auth errors
    if (response.status === 401 || response.status === 403) {
      handleAuthError()
      throw new Error('Authentication required. Please login again.')
    }
    
    throw new Error(message)
  }

  const data = await response.json()
  
  // Invalidate proceedings cache since we added a new one
  const cache = useApiCacheStore.getState()
  cache.invalidateProceedings() // Clear all proceedings cache
  if (payload.fir) {
    cache.invalidateFIR(payload.fir) // Invalidate this FIR's proceedings
  }
  
  return data as Proceeding
}

