import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useThemeStore, THEMES, THEME_LABELS, initTheme } from '../store/theme'

beforeEach(() => {
  useThemeStore.setState({ theme: 'volt' })
  document.documentElement.removeAttribute('data-theme')
})

describe('useThemeStore', () => {
  it('기본 테마는 volt', () => {
    expect(useThemeStore.getState().theme).toBe('volt')
  })

  it('setTheme으로 테마를 변경한다', () => {
    useThemeStore.getState().setTheme('sapphire')
    expect(useThemeStore.getState().theme).toBe('sapphire')
  })

  it('setTheme은 data-theme 속성을 설정한다', () => {
    useThemeStore.getState().setTheme('indigo')
    expect(document.documentElement.getAttribute('data-theme')).toBe('indigo')
  })

  it('모든 테마를 순환할 수 있다', () => {
    for (const t of THEMES) {
      useThemeStore.getState().setTheme(t)
      expect(useThemeStore.getState().theme).toBe(t)
    }
  })
})

describe('THEMES / THEME_LABELS', () => {
  it('THEMES에 volt가 포함된다', () => {
    expect(THEMES).toContain('volt')
  })

  it('모든 테마에 레이블이 존재한다', () => {
    for (const t of THEMES) {
      expect(THEME_LABELS[t]).toBeTruthy()
    }
  })
})

describe('initTheme', () => {
  it('override 없으면 저장된 테마 적용', () => {
    useThemeStore.setState({ theme: 'forest' })
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('forest')
  })

  it('유효한 override는 적용된다', () => {
    initTheme('arctic')
    expect(document.documentElement.getAttribute('data-theme')).toBe('arctic')
  })

  it('유효하지 않은 override는 무시하고 저장된 테마 사용', () => {
    useThemeStore.setState({ theme: 'volt' })
    initTheme('invalid-theme')
    expect(document.documentElement.getAttribute('data-theme')).toBe('volt')
  })

  it('null override는 저장된 테마 사용', () => {
    useThemeStore.setState({ theme: 'sapphire' })
    initTheme(null)
    expect(document.documentElement.getAttribute('data-theme')).toBe('sapphire')
  })
})
