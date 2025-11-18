import type {
  FIR,
  FIRCityBreakdown,
  FIRDashboardMetrics,
  CreateFIRInput,
  Proceeding,
  CreateProceedingInput,
} from '../types'
import { useAuthStore } from '../store'

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
  if (currentPath !== '/login' && currentPath !== '/signup') {
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
  return request<FIR[]>('/v1/firs')
}

export async function fetchFIRDashboard() {
  return request<FIRDashboardMetrics>('/v1/firs/dash')
}

export async function fetchFIRCityGraph() {
  return request<FIRCityBreakdown[]>('/v1/firs/graph')
}

export async function fetchFIRDetail(id: string) {
  return request<FIR>(`/v1/firs/${id}`)
}

export async function searchFIRs(query: string) {
  return request<FIR[]>(`/v1/firs/search?q=${encodeURIComponent(query)}`)
}

export async function createFIR(payload: CreateFIRInput) {
  return request<FIR>('/v1/firs', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Proceeding endpoints
export async function fetchAllProceedings() {
  return request<Proceeding[]>('/v1/proceedings')
}

export async function fetchProceedingsByFIR(firId: string) {
  return request<Proceeding[]>(`/v1/proceedings/fir/${firId}`)
}

export async function createProceeding(payload: CreateProceedingInput) {
  return request<Proceeding>('/v1/proceedings', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

