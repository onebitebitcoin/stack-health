import { describe, expect, it, vi } from 'vitest'
import { AxiosError } from 'axios'

// i18n mock: errors namespace ko 번역 값을 그대로 반환
vi.mock('../i18n', () => {
  const koErrors: Record<string, string> = {
    'errors:networkError': '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
    'errors:invalidInput': '입력값을 다시 확인해주세요.',
    'errors:unauthorized': '로그인이 필요하거나 인증 정보가 올바르지 않습니다.',
    'errors:forbidden': '이 작업을 할 권한이 없습니다.',
    'errors:notFound': '요청한 정보를 찾을 수 없습니다.',
    'errors:conflict': '이미 처리되었거나 중복된 요청입니다.',
    'errors:fileTooLarge': '파일 크기가 너무 큽니다.',
    'errors:tooManyRequests': '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'errors:serverError': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    'errors:fieldPassword': '비밀번호',
    'errors:fieldUsername': '닉네임',
    'errors:fieldEmail': '이메일',
    'errors:fieldLightningAddress': '라이트닝 주소',
    'errors:fieldCaption': '내용',
    'errors:fieldTitle': '제목',
    'errors:fieldDefault': '입력값',
    'errors:passwordTooShort': '비밀번호는 8자 이상 입력해주세요.',
    'errors:passwordTooLong': '비밀번호는 100자 이하로 입력해주세요.',
    'errors:usernameTooShort': '닉네임은 2자 이상 입력해주세요.',
    'errors:usernameTooLong': '닉네임은 30자 이하로 입력해주세요.',
    'errors:emailInvalid': '이메일 형식이 올바르지 않습니다.',
    'errors:fieldMissing': '{{field}}을(를) 입력해주세요.',
    'errors:fieldTooShort': '{{field}}이(가) 너무 짧습니다.',
    'errors:fieldTooLong': '{{field}}이(가) 너무 깁니다.',
    'errors:fieldInvalid': '{{field}}을(를) 다시 확인해주세요.',
  }

  return {
    default: {
      t: (key: string, options?: { ns?: string; [k: string]: unknown }) => {
        const ns = options?.ns ?? 'common'
        const fullKey = `${ns}:${key}`
        let result = koErrors[fullKey] ?? key
        // 단순 interpolation 처리
        if (options) {
          for (const [k, v] of Object.entries(options)) {
            if (k !== 'ns') result = result.replace(`{{${k}}}`, String(v))
          }
        }
        return result
      },
    },
  }
})

import { getApiErrorMessage, getApiErrorMessageFromBody } from '../api/errors'

function axiosError(status: number | undefined, data?: unknown) {
  return new AxiosError('Request failed with status code ' + status, undefined, undefined, undefined, status ? {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: { headers: {} } as never,
  } : undefined)
}

describe('getApiErrorMessage', () => {
  it('converts pydantic password validation details to a Korean user message', () => {
    const err = axiosError(422, {
      detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters', type: 'string_too_short' }],
    })

    expect(getApiErrorMessage(err, '오류가 발생했습니다')).toBe('비밀번호는 8자 이상 입력해주세요.')
  })

  it('does not expose raw English axios or server errors', () => {
    expect(getApiErrorMessage(axiosError(500, { detail: 'RuntimeError: R2 down' }), '업로드 실패'))
      .toBe('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    expect(getApiErrorMessage(axiosError(undefined), '업로드 실패'))
      .toBe('서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.')
  })

  it('keeps Korean server messages', () => {
    expect(getApiErrorMessage(axiosError(400, { detail: '이미 사용 중인 이메일입니다' }), '오류가 발생했습니다'))
      .toBe('이미 사용 중인 이메일입니다')
  })

  it('sanitizes fetch response bodies without axios', () => {
    expect(getApiErrorMessageFromBody({ detail: 'Service unavailable' }, 'Google 로그인을 사용할 수 없습니다'))
      .toBe('Google 로그인을 사용할 수 없습니다')
  })
})
