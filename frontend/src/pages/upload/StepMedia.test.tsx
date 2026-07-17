import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import StepMedia, { type MediaItem } from './StepMedia'

vi.mock('../../api/client', () => ({
  default: { post: vi.fn(() => new Promise(() => undefined)) },
}))
import client from '../../api/client'

function makeItem(kind: 'video' | 'image', id: string, durationSec?: number): MediaItem {
  return {
    id,
    kind,
    file: new File(['x'], `${id}.${kind === 'video' ? 'mp4' : 'png'}`, { type: kind === 'video' ? 'video/mp4' : 'image/png' }),
    previewUrl: `blob:${id}`,
    durationSec,
  }
}

function buildProps(overrides: Partial<React.ComponentProps<typeof StepMedia>> = {}) {
  return {
    fileInputRef: { current: null },
    items: [] as MediaItem[],
    onAddFiles: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
    estimatedSeconds: 0,
    error: '',
    onNext: vi.fn(),
    cartoonFilter: false,
    setCartoonFilter: vi.fn(),
    ...overrides,
  }
}

describe('StepMedia', () => {
  it('아이템이 없으면 다음 버튼이 비활성', () => {
    render(<StepMedia {...buildProps()} />)
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  })

  it('아이템을 렌더한다', () => {
    const items = [makeItem('image', 'a'), makeItem('video', 'b', 5)]
    render(<StepMedia {...buildProps({ items, estimatedSeconds: 8 })} />)
    expect(screen.getAllByLabelText('remove')).toHaveLength(2)
  })

  it('예상 길이가 60초를 초과하면 다음 버튼 비활성', () => {
    const items = [makeItem('video', 'b', 65)]
    render(<StepMedia {...buildProps({ items, estimatedSeconds: 65 })} />)
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  })

  it('정상 구성이면 다음 클릭 시 onNext 호출', async () => {
    const onNext = vi.fn()
    const items = [makeItem('image', 'a')]
    render(<StepMedia {...buildProps({ items, estimatedSeconds: 3, onNext })} />)
    await userEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('삭제 버튼 클릭 시 onRemove(id) 호출', async () => {
    const onRemove = vi.fn()
    const items = [makeItem('image', 'a')]
    render(<StepMedia {...buildProps({ items, estimatedSeconds: 3, onRemove })} />)
    await userEvent.click(screen.getByLabelText('remove'))
    expect(onRemove).toHaveBeenCalledWith('a')
  })

  it('아이템이 없으면 카툰 필터 토글이 보이지 않는다', () => {
    render(<StepMedia {...buildProps()} />)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('토글 클릭 시 setCartoonFilter(true) 호출', async () => {
    const setCartoonFilter = vi.fn()
    const items = [makeItem('image', 'a')]
    render(<StepMedia {...buildProps({ items, estimatedSeconds: 3, setCartoonFilter })} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(setCartoonFilter).toHaveBeenCalledWith(true)
  })

  it('필터 ON이면 이미지 아이템으로 filter-preview 요청을 보낸다', async () => {
    const items = [makeItem('image', 'a')]
    render(<StepMedia {...buildProps({ items, estimatedSeconds: 3, cartoonFilter: true })} />)
    await waitFor(() =>
      expect(vi.mocked(client.post)).toHaveBeenCalledWith(
        '/videos/filter-preview',
        expect.any(FormData),
        expect.objectContaining({ responseType: 'blob' }),
      ),
    )
  })
})
