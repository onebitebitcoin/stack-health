import { type AxiosError, isAxiosError } from 'axios'

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

const DEFAULT_NETWORK_ERROR = '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'

function isKoreanUserMessage(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/Request failed|Network Error|AxiosError|timeout|status code|Internal Server Error/i.test(trimmed)) return false
  // 서버가 이미 한국어 사용자 메시지를 내려준 경우만 그대로 노출한다.
  return /[가-힣]/.test(trimmed)
}

function fieldName(loc: unknown[] | undefined): string {
  const field = loc?.[loc.length - 1]
  if (field === 'email') return '이메일'
  if (field === 'username') return '닉네임'
  if (field === 'password') return '비밀번호'
  if (field === 'lightning_address') return '라이트닝 주소'
  if (field === 'caption') return '내용'
  if (field === 'title') return '제목'
  return '입력값'
}

function validationIssueMessage(issue: ValidationIssue): string {
  const name = fieldName(issue.loc)
  const type = typeof issue.type === 'string' ? issue.type : ''
  const msg = typeof issue.msg === 'string' ? issue.msg : ''

  if (name === '비밀번호' && (type.includes('string_too_short') || /at least 8|min_length/i.test(msg))) {
    return '비밀번호는 8자 이상 입력해주세요.'
  }
  if (name === '비밀번호' && (type.includes('string_too_long') || /at most 100|max_length/i.test(msg))) {
    return '비밀번호는 100자 이하로 입력해주세요.'
  }
  if (name === '닉네임' && (type.includes('string_too_short') || /at least 2|min_length/i.test(msg))) {
    return '닉네임은 2자 이상 입력해주세요.'
  }
  if (name === '닉네임' && (type.includes('string_too_long') || /at most 30|max_length/i.test(msg))) {
    return '닉네임은 30자 이하로 입력해주세요.'
  }
  if (name === '이메일' || type.includes('value_error') || /email/i.test(msg)) {
    return '이메일 형식이 올바르지 않습니다.'
  }
  if (type.includes('missing')) return `${name}을(를) 입력해주세요.`
  if (type.includes('string_too_short')) return `${name}이(가) 너무 짧습니다.`
  if (type.includes('string_too_long')) return `${name}이(가) 너무 깁니다.`
  return `${name}을(를) 다시 확인해주세요.`
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
    if (status === 400 || status === 422) return '입력값을 다시 확인해주세요.'
    if (status === 401) return '로그인이 필요하거나 인증 정보가 올바르지 않습니다.'
    if (status === 403) return '이 작업을 할 권한이 없습니다.'
    if (status === 404) return '요청한 정보를 찾을 수 없습니다.'
    if (status === 409) return '이미 처리되었거나 중복된 요청입니다.'
    if (status === 413) return '파일 크기가 너무 큽니다.'
    if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
    if (status && status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    if (!status) return DEFAULT_NETWORK_ERROR
  }

  return fallback
}
