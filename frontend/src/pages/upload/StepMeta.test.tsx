import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import StepMeta from './StepMeta'

vi.mock('./MediaPreviewBox', () => ({
  default: () => <div data-testid="media-preview" />,
}))

function buildProps(overrides: Partial<React.ComponentProps<typeof StepMeta>> = {}) {
  return {
    mainCategory: '비트코인' as const,
    setMainCategory: vi.fn(),
    hasChallenge: false,
    setHasChallenge: vi.fn(),
    selectedChallenge: null,
    selectedChallengeId: null,
    clearChallenge: vi.fn(),
    openChallengeModal: vi.fn(),
    showChallengeModal: false,
    setShowChallengeModal: vi.fn(),
    challengeSearch: '',
    setChallengeSearch: vi.fn(),
    displayedChallenges: [],
    selectChallenge: vi.fn(),
    visibility: 'public' as const,
    setVisibility: vi.fn(),
    caption: '',
    setCaption: vi.fn(),
    limitError: '',
    setLimitError: vi.fn(),
    error: '',
    uploading: false,
    onUpload: vi.fn(),
    items: [],
    subtitleSource: 'none',
    subtitleLines: [],
    subtitleSize: 'small' as const,
    subtitlePosition: 'center' as const,
    videoFilter: '' as const,
    filteredPreviewUrl: null,
    ...overrides,
  }
}

describe('StepMeta 공개 범위', () => {
  it('기본값은 공개이고 공개 안내 문구를 보여준다', () => {
    render(<StepMeta {...buildProps()} />)
    expect(screen.getByRole('button', { name: '공개' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비공개' })).toBeInTheDocument()
    expect(screen.getByText('피드에 올라가고 다른 사용자가 볼 수 있습니다.')).toBeInTheDocument()
  })

  it('비공개 버튼을 누르면 setVisibility 가 private 으로 호출된다', async () => {
    const setVisibility = vi.fn()
    render(<StepMeta {...buildProps({ setVisibility })} />)
    await userEvent.click(screen.getByRole('button', { name: '비공개' }))
    expect(setVisibility).toHaveBeenCalledWith('private')
  })

  it('비공개를 고르면 비공개 안내 문구로 바뀐다', () => {
    render(<StepMeta {...buildProps({ visibility: 'private' })} />)
    expect(
      screen.getByText('나만 볼 수 있습니다. 나중에 프로필에서 공개로 바꿀 수 있습니다.'),
    ).toBeInTheDocument()
  })
})
