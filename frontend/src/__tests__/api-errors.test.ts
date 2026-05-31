import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
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
