import { type AxiosError, isAxiosError } from 'axios'
import i18n from '../i18n'

type ApiErrorBody = {
  detail?: unknown
  message?: unknown
}

type CodedError = {
  code: string
  message: string
}

type ValidationIssue = {
  loc?: unknown[]
  msg?: unknown
  type?: unknown
}

function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, { ns: 'errors', ...options })
}

function isKoreanUserMessage(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/Request failed|Network Error|AxiosError|timeout|status code|Internal Server Error/i.test(trimmed)) return false
  // 서버가 이미 한국어 사용자 메시지를 내려준 경우만 그대로 노출한다.
  return /[가-힣]/.test(trimmed)
}

function fieldName(loc: unknown[] | undefined): string {
  const field = loc?.[loc.length - 1]
  if (field === 'email') return t('fieldEmail')
  if (field === 'username') return t('fieldUsername')
  if (field === 'password') return t('fieldPassword')
  if (field === 'lightning_address') return t('fieldLightningAddress')
  if (field === 'caption') return t('fieldCaption')
  if (field === 'title') return t('fieldTitle')
  return t('fieldDefault')
}

function validationIssueMessage(issue: ValidationIssue): string {
  const name = fieldName(issue.loc)
  const type = typeof issue.type === 'string' ? issue.type : ''
  const msg = typeof issue.msg === 'string' ? issue.msg : ''

  const isPassword = issue.loc?.includes('password')
  const isUsername = issue.loc?.includes('username')
  const isEmail = issue.loc?.includes('email')

  if (isPassword && (type.includes('string_too_short') || /at least 8|min_length/i.test(msg))) {
    return t('passwordTooShort')
  }
  if (isPassword && (type.includes('string_too_long') || /at most 100|max_length/i.test(msg))) {
    return t('passwordTooLong')
  }
  if (isUsername && (type.includes('string_too_short') || /at least 2|min_length/i.test(msg))) {
    return t('usernameTooShort')
  }
  if (isUsername && (type.includes('string_too_long') || /at most 30|max_length/i.test(msg))) {
    return t('usernameTooLong')
  }
  if (isEmail || type.includes('value_error') || /email/i.test(msg)) {
    return t('emailInvalid')
  }
  if (type.includes('missing')) return t('fieldMissing', { field: name })
  if (type.includes('string_too_short')) return t('fieldTooShort', { field: name })
  if (type.includes('string_too_long')) return t('fieldTooLong', { field: name })
  return t('fieldInvalid', { field: name })
}

function isCodedError(value: unknown): value is CodedError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    typeof (value as CodedError).code === 'string' &&
    typeof (value as CodedError).message === 'string'
  )
}

function detailToMessage(detail: unknown): string | null {
  if (isCodedError(detail)) return `${detail.message} [${detail.code}]`
  if (typeof detail === 'string') return isKoreanUserMessage(detail) ? detail : null
  if (Array.isArray(detail) && detail.length > 0) {
    return validationIssueMessage(detail[0] as ValidationIssue)
  }
  return null
}


export function getApiErrorMessageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const apiBody = body as ApiErrorBody
    if (typeof apiBody.message === 'string' && isKoreanUserMessage(apiBody.message)) return apiBody.message
    const detailMessage = detailToMessage(apiBody.detail)
    if (detailMessage) return detailMessage
  }
  return fallback
}

export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const axiosError = err as AxiosError<ApiErrorBody>
    const body = axiosError.response?.data

    const bodyMessage = getApiErrorMessageFromBody(body, '')
    if (bodyMessage) return bodyMessage

    const status = axiosError.response?.status
    if (status === 400 || status === 422) return t('invalidInput')
    if (status === 401) return t('unauthorized')
    if (status === 403) return t('forbidden')
    if (status === 404) return t('notFound')
    if (status === 409) return t('conflict')
    if (status === 413) return t('fileTooLarge')
    if (status === 429) return t('tooManyRequests')
    if (status && status >= 500) return t('serverError')
    if (!status) return t('networkError')
  }

  return fallback
}
