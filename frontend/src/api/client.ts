import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/auth'

const client = axios.create({
  baseURL: '/api/v1',
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// access token 만료(401) 시 refresh token으로 1회 자동 갱신.
// 동시에 여러 요청이 401을 받아도 refresh는 한 번만 수행하고 나머지는 대기시킨다.
let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) throw new Error('no refresh token')
  // baseURL만 사용하는 raw axios로 호출 — 인터셉터 재귀 방지
  const res = await axios.post<{ data: { access_token: string; refresh_token: string } }>(
    '/api/v1/auth/refresh',
    { refresh_token: refreshToken },
  )
  const { access_token, refresh_token } = res.data.data
  useAuthStore.getState().setTokens(access_token, refresh_token)
  return access_token
}

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean; _retriedWithoutAuth?: boolean }

// refresh token이 없거나 refresh 자체가 실패해서 로그아웃할 때, 원래 요청이 Authorization
// 헤더만 달고 있던 공개 조회(get_optional_user 계열 — 피드/게시물 조회 등)였다면 헤더
// 없이 1회만 다시 시도한다. 그래야 access token이 하루 넘게 갱신되지 않은 브라우저가
// 공개 조회에서 곧장 에러 화면을 보지 않는다. 로그인이 필수인 엔드포인트는 헤더 없이
// 재시도해도 다시 401이 나므로 그대로 거절된다. _retriedWithoutAuth 플래그로 무한 루프를
// 막는다(같은 요청을 두 번 넘게 재시도하지 않는다).
function retryWithoutAuthOrReject(
  original: RetriableConfig | undefined,
  err: AxiosError,
): Promise<unknown> {
  const hadAuthHeader = Boolean((original?.headers as Record<string, unknown> | undefined)?.Authorization)
  if (!original || !hadAuthHeader || original._retriedWithoutAuth) {
    return Promise.reject(err)
  }
  original._retriedWithoutAuth = true
  const headers = { ...original.headers } as Record<string, unknown>
  delete headers.Authorization
  return client({ ...original, headers } as AxiosRequestConfig)
}

client.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as RetriableConfig | undefined
    const status = err.response?.status

    // refresh 엔드포인트 자체의 401이거나, 이미 재시도한 요청이면 바로 로그아웃
    const isRefreshCall = original?.url?.includes('/auth/refresh')
    if (status === 401 && original && !original._retry && !isRefreshCall) {
      if (!useAuthStore.getState().refreshToken) {
        useAuthStore.getState().logout()
        return retryWithoutAuthOrReject(original, err)
      }
      original._retry = true
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }
        const newToken = await refreshPromise
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` }
        return client(original)
      } catch {
        useAuthStore.getState().logout()
        return retryWithoutAuthOrReject(original, err)
      }
    }

    if (status === 401) {
      useAuthStore.getState().logout()
    }
    return Promise.reject(err)
  },
)

export default client
