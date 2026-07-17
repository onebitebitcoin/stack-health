import { describe, it, expect } from 'vitest'
import { useUiStore } from '../store/ui'

describe('useUiStore', () => {
  it('초기 commentOpen은 false', () => {
    expect(useUiStore.getState().commentOpen).toBe(false)
  })

  it('setCommentOpen으로 열고 닫는다', () => {
    useUiStore.getState().setCommentOpen(true)
    expect(useUiStore.getState().commentOpen).toBe(true)
    useUiStore.getState().setCommentOpen(false)
    expect(useUiStore.getState().commentOpen).toBe(false)
  })
})
