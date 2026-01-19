export class ApiError extends Error {
  status?: number
  data?: unknown

  constructor(message: string, opts?: { status?: number; data?: unknown }) {
    super(message)
    this.name = 'ApiError'
    this.status = opts?.status
    this.data = opts?.data
  }
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || fallback
  try {
    return JSON.stringify(err)
  } catch {
    return fallback
  }
}

export function mapHttpStatusToMessage(status?: number): string | null {
  if (!status) return null
  if (status === 400) return 'Please check your input and try again.'
  if (status === 401) return 'Your session has expired. Please login again.'
  if (status === 403) return 'You do not have permission to do that.'
  if (status === 404) return 'Not found.'
  if (status === 409) return 'Conflict. Please refresh and try again.'
  if (status >= 500) return 'Server error. Please try again in a moment.'
  return null
}

