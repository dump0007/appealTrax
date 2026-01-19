import { toast } from 'react-hot-toast'
import { ApiError, getErrorMessage, mapHttpStatusToMessage } from './errors'

export { toast }

export function toastError(err: unknown, fallback?: string) {
  if (err instanceof ApiError) {
    const statusMessage = mapHttpStatusToMessage(err.status)
    toast.error(getErrorMessage(err, statusMessage || fallback))
    return
  }
  toast.error(getErrorMessage(err, fallback))
}

