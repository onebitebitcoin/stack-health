import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeBootSplash } from './bootSplash'

describe('removeBootSplash', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('페이드아웃 후 요소를 제거한다', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="boot-splash"></div>'
    removeBootSplash()
    expect(document.getElementById('boot-splash')?.style.opacity).toBe('0')
    vi.advanceTimersByTime(300)
    expect(document.getElementById('boot-splash')).toBeNull()
  })

  it('요소가 없으면 아무 일도 하지 않는다', () => {
    expect(() => removeBootSplash()).not.toThrow()
  })
})
