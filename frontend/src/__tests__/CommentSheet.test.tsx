import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommentSheet from '../components/CommentSheet'
import { useAuthStore } from '../store/auth'
import type { Comment } from '../api/types'

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

const baseComment: Comment = {
  id: 1,
  post_id: 10,
  user_id: 99,
  parent_id: null,
  username: 'writer',
  avatar_url: null,
  profile_color: null,
  content: '좋아요를 눌러볼 댓글입니다',
  created_at: '2026-06-01T00:00:00Z',
  like_count: 2,
  is_liked: false,
  replies: [],
}

function renderSheet(onLoginRequired = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CommentSheet postId={10} open onClose={vi.fn()} onLoginRequired={onLoginRequired} />
    </QueryClientProvider>,
  )
  return { onLoginRequired }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.getState().logout()
  mockClient.get.mockResolvedValue({ data: { data: { comments: [baseComment] } } })
})

describe('CommentSheet 댓글 좋아요', () => {
  it('좋아요 수와 하트 상태를 목록에 표시한다', async () => {
    renderSheet()
    expect(await screen.findByText('좋아요를 눌러볼 댓글입니다')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('비로그인 사용자가 누르면 API 대신 로그인 유도 콜백을 호출한다', async () => {
    const user = userEvent.setup()
    const { onLoginRequired } = renderSheet()
    await screen.findByText('좋아요를 눌러볼 댓글입니다')

    await user.click(screen.getByLabelText('댓글 좋아요'))

    expect(onLoginRequired).toHaveBeenCalledTimes(1)
    expect(mockClient.post).not.toHaveBeenCalled()
  })

  it('로그인 사용자가 누르면 낙관적으로 즉시 반영하고 서버 응답으로 확정한다', async () => {
    useAuthStore.getState().login('token-abc', {
      id: 1,
      email: 'me@x.com',
      username: 'me',
      lightning_address: null,
      avatar_url: null,
      is_admin: false,
      app_settings: {},
    })
    mockClient.post.mockResolvedValue({ data: { data: { liked: true, like_count: 3 } } })

    const user = userEvent.setup()
    renderSheet()
    await screen.findByText('좋아요를 눌러볼 댓글입니다')

    await user.click(screen.getByLabelText('댓글 좋아요'))

    // 낙관적 업데이트: 서버 응답 전에도 카운트가 즉시 올라간다
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(mockClient.post).toHaveBeenCalledWith('/feed/10/comments/1/like')
  })

  it('좋아요 요청이 실패하면 낙관적 업데이트를 되돌리고 에러 메시지를 보여준다', async () => {
    useAuthStore.getState().login('token-abc', {
      id: 1,
      email: 'me@x.com',
      username: 'me',
      lightning_address: null,
      avatar_url: null,
      is_admin: false,
      app_settings: {},
    })
    mockClient.post.mockRejectedValue(new Error('network error'))

    const user = userEvent.setup()
    renderSheet()
    await screen.findByText('좋아요를 눌러볼 댓글입니다')

    await user.click(screen.getByLabelText('댓글 좋아요'))

    // 실패 후 원래 카운트(2)로 롤백되고 에러 메시지가 노출된다
    await waitFor(() => expect(screen.getByText('좋아요 처리에 실패했습니다')).toBeInTheDocument())
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
