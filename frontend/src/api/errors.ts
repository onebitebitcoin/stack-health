import { type AxiosError, isAxiosError } from 'axios'

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = (err as AxiosError<{ detail?: string }>).response?.data?.detail
    if (typeof detail === 'string' && detail.length > 0) return detail
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}
