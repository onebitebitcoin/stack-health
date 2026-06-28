import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SurveyPage from '../pages/SurveyPage'

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockClient = await import('../api/client').then((m) => m.default) as any

const mockSurvey = {
  id: 1,
  slug: 'test-survey',
  title: '테스트 설문',
  description: '설문에 응해주셔서 감사합니다.',
  is_active: true,
  is_open: true,
  closes_at: null,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  questions: [
    {
      id: 'q1',
      type: 'single' as const,
      title: '어떤 기능을 주로 사용하나요?',
      description: null,
      required: true,
      options: ['영상 시청', '업로드'],
      scale_min: null,
      scale_max: null,
      scale_min_label: null,
      scale_max_label: null,
    },
  ],
}

function renderSurveyPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/survey/test-survey']}>
        <Routes>
          <Route path="/survey/:slug" element={<SurveyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockClient.get.mockResolvedValue({ data: { data: { survey: mockSurvey } } })
  mockClient.post.mockResolvedValue({ data: { data: { submitted: true } } })
})

describe('SurveyPage', () => {
  it('인트로 → 폼 → 리뷰 요약 → 제출 → done 흐름', async () => {
    const user = userEvent.setup()
    renderSurveyPage()

    // 1. 인트로 화면: 설문 제목 표시
    expect(await screen.findByText('테스트 설문')).toBeInTheDocument()
    expect(screen.getByText('설문 시작하기')).toBeInTheDocument()

    // 2. 설문 시작
    await user.click(screen.getByText('설문 시작하기'))

    // 3. 폼 화면: 질문 표시
    expect(await screen.findByText('어떤 기능을 주로 사용하나요?')).toBeInTheDocument()

    // 4. 라디오 선택
    const radio = screen.getByRole('radio', { name: '영상 시청' })
    await user.click(radio)

    // 5. 다음 버튼 클릭 → 리뷰 단계
    await user.click(screen.getByText('다음'))

    // 6. 리뷰 화면: 응답 요약 표시
    expect(await screen.findByText('응답 확인')).toBeInTheDocument()
    expect(screen.getByText('영상 시청')).toBeInTheDocument()

    // 7. 제출
    await user.click(screen.getByText('제출하기'))

    // 8. done 화면
    expect(await screen.findByText('감사합니다!')).toBeInTheDocument()

    // 9. API 호출 검증
    expect(mockClient.post).toHaveBeenCalledWith(
      '/surveys/public/test-survey/responses',
      { answers: { q1: '영상 시청' } },
    )

    // 10. localStorage 플래그 설정 확인
    expect(localStorage.getItem('sh_survey_done_test-survey')).toBe('true')
  })

  it('localStorage 플래그가 있으면 이미 참여 화면 표시', async () => {
    localStorage.setItem('sh_survey_done_test-survey', 'true')
    renderSurveyPage()

    expect(await screen.findByText('이미 참여하셨습니다')).toBeInTheDocument()
  })
})
