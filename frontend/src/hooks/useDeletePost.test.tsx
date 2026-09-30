import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useDeletePost } from './useDeletePost'

vi.mock('../api/client', () => ({
  default: { delete: vi.fn() },
}))
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

const page = { posts: [{ id: 1 }, { id: 2 }], has_more: false, week_offset: 0 }

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  queryClient.setQueryData(['my-posts'], page)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useDeletePost(), { wrapper })
  return { queryClient, result }
}

describe('useDeletePost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('서버 응답 전에 목록에서 먼저 빼고, 성공하면 성공 토스트를 띄운다', async () => {
    let resolveDelete: (v: unknown) => void = () => {}
    mockClient.delete.mockReturnValue(new Promise((r) => { resolveDelete = r }))
    const { queryClient, result } = setup()

    act(() => { result.current.mutate(1) })

    await waitFor(() => {
      expect(queryClient.getQueryData<typeof page>(['my-posts'])?.posts).toEqual([{ id: 2 }])
    })
    expect(toast.success).not.toHaveBeenCalled()

    await act(async () => { resolveDelete({ data: { data: { deleted: 1 } } }) })

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(mockClient.delete).toHaveBeenCalledWith('/videos/posts/1')
  })

  it('서버가 실패하면 목록을 되돌리고 실패 토스트를 띄운다', async () => {
    mockClient.delete.mockRejectedValue(new Error('Network Error'))
    const { queryClient, result } = setup()

    act(() => { result.current.mutate(1) })

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(queryClient.getQueryData<typeof page>(['my-posts'])?.posts).toEqual(page.posts)
    expect(toast.success).not.toHaveBeenCalled()
  })
})
