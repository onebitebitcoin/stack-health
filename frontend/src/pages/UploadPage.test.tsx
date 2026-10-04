import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import UploadPage from './UploadPage'

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}))
vi.mock('./upload/StepMedia', () => ({
  default: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>next</button>,
}))
vi.mock('./upload/StepSubtitle', () => ({
  default: ({ onNext }: { onNext: () => void }) => <button onClick={onNext}>next2</button>,
}))
vi.mock('./upload/StepMeta', () => ({
  default: (p: { hasChallenge: boolean | null; selectedChallengeId: number | null }) => (
    <div data-testid="meta">{`has=${String(p.hasChallenge)} id=${String(p.selectedChallengeId)}`}</div>
  ),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

beforeEach(() => {
  vi.clearAllMocks()
  mockClient.get.mockResolvedValue({
    data: { data: { challenges: [{ id: 7, title: '참여중', joined: true }] } },
  })
})

describe('UploadPage 챌린지 기본값', () => {
  it('참여중 챌린지가 있어도 기본은 없음(선택 없음)이다', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UploadPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(mockClient.get).toHaveBeenCalled())
    await userEvent.click(await screen.findByText('next'))
    await userEvent.click(await screen.findByText('next2'))
    expect(await screen.findByTestId('meta')).toHaveTextContent('has=false id=null')
  })
})
