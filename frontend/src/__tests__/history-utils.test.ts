import { describe, it, expect } from 'vitest'

// HistoryPage의 순수 유틸 함수들을 추출하여 테스트
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayIndex(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

describe('getDaysInMonth', () => {
  it('1월은 31일', () => expect(getDaysInMonth(2025, 1)).toBe(31))
  it('2월 평년은 28일', () => expect(getDaysInMonth(2025, 2)).toBe(28))
  it('2월 윤년은 29일', () => expect(getDaysInMonth(2024, 2)).toBe(29))
  it('4월은 30일', () => expect(getDaysInMonth(2025, 4)).toBe(30))
  it('12월은 31일', () => expect(getDaysInMonth(2025, 12)).toBe(31))
})

describe('getFirstDayIndex', () => {
  it('2025-01-01은 수요일 → index 2', () => expect(getFirstDayIndex(2025, 1)).toBe(2))
  it('2025-04-01은 화요일 → index 1', () => expect(getFirstDayIndex(2025, 4)).toBe(1))
  it('월요일(index 0) 계산이 올바르다', () => {
    // 2026-06-01은 월요일
    expect(getFirstDayIndex(2026, 6)).toBe(0)
  })
  it('일요일(index 6) 계산이 올바르다', () => {
    // 2025-06-01은 일요일
    expect(getFirstDayIndex(2025, 6)).toBe(6)
  })
})

describe('pad2', () => {
  it('한 자리 숫자를 두 자리로', () => expect(pad2(5)).toBe('05'))
  it('두 자리 숫자는 그대로', () => expect(pad2(12)).toBe('12'))
  it('0은 00으로', () => expect(pad2(0)).toBe('00'))
})
