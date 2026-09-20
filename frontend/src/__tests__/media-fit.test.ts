import { describe, it, expect } from 'vitest'
import { shouldFitContain } from '../utils/mediaFit'

/** 세로 비율을 가로 나누기 세로 값으로 바꾼다. */
const ratio = (w: number, h: number) => w / h

// 실제 기기 화면 크기 (CSS 픽셀 기준)
const IPHONE_14_PRO = ratio(393, 852)   // 약 0.461 — 요즘 흔한 길쭉한 화면
const IPHONE_SE = ratio(375, 667)       // 약 0.562 — 9:16에 가까운 화면
const PIXEL_7 = ratio(412, 915)         // 약 0.450

// 업로드되는 미디어 비율
const SHORTS_9_16 = ratio(1080, 1920)   // 0.5625
const PHOTO_3_4 = ratio(3024, 4032)     // 0.75  — 아이폰 기본 카메라 세로 사진
const TALL_9_20 = ratio(1080, 2400)     // 0.45
const LANDSCAPE = ratio(1920, 1080)     // 1.778

describe('shouldFitContain', () => {
  it('9:16 영상을 길쭉한 화면에 올리면 좌우가 잘리므로 전부 보여준다', () => {
    // 이 경우가 기존 고정 기준값(0.65)에서 잘려 나가던 사례다.
    expect(shouldFitContain(SHORTS_9_16, IPHONE_14_PRO)).toBe(true)
    expect(shouldFitContain(SHORTS_9_16, PIXEL_7)).toBe(true)
  })

  it('9:16 영상을 9:16에 가까운 화면에 올리면 잘리지 않으므로 꽉 채운다', () => {
    expect(shouldFitContain(SHORTS_9_16, IPHONE_SE)).toBe(false)
  })

  it('휴대전화로 찍은 4:3 세로 사진은 어느 화면에서도 전부 보여준다', () => {
    expect(shouldFitContain(PHOTO_3_4, IPHONE_14_PRO)).toBe(true)
    expect(shouldFitContain(PHOTO_3_4, IPHONE_SE)).toBe(true)
    expect(shouldFitContain(PHOTO_3_4, PIXEL_7)).toBe(true)
  })

  it('화면보다 더 길쭉한 9:20 영상은 여백 없이 꽉 채운다', () => {
    expect(shouldFitContain(TALL_9_20, IPHONE_14_PRO)).toBe(false)
    expect(shouldFitContain(TALL_9_20, PIXEL_7)).toBe(false)
  })

  it('가로 영상은 전부 보여준다', () => {
    expect(shouldFitContain(LANDSCAPE, IPHONE_14_PRO)).toBe(true)
  })

  it('미디어와 화면 비율이 2% 이내로 비슷하면 꽉 채운다', () => {
    expect(shouldFitContain(0.5, 0.5)).toBe(false)
    expect(shouldFitContain(0.509, 0.5)).toBe(false)   // 1.8% 차이
    expect(shouldFitContain(0.511, 0.5)).toBe(true)    // 2.2% 차이
  })

  it('크기를 아직 읽지 못해 값이 0이거나 유효하지 않으면 꽉 채우는 쪽으로 둔다', () => {
    expect(shouldFitContain(0, 0.5)).toBe(false)
    expect(shouldFitContain(0.5, 0)).toBe(false)
    expect(shouldFitContain(NaN, 0.5)).toBe(false)
    expect(shouldFitContain(0.5, Infinity)).toBe(false)
  })
})
