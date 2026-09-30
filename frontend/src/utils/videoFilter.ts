/** 업로드 폼 video_filter 값. ''(빈 값) = 효과 없음(필드 미전송). */
export type VideoFilterValue = '' | 'cartoon' | 'sketch' | 'orange_cartoon' | 'monet' | 'mono_cartoon'

/** 옵션 제목 옆 배지 — i18n 키 filter.badges.* */
export type VideoFilterBadge = 'natureRecommended'

/** 효과 선택 UI 옵션 순서 — StepMedia 드롭다운과 i18n 키(filter.options.*)가 공유. */
export const VIDEO_FILTER_OPTIONS: { value: VideoFilterValue; key: string; badge?: VideoFilterBadge }[] = [
  { value: '' as const, key: 'none' },
  { value: 'cartoon' as const, key: 'cartoon' },
  { value: 'sketch' as const, key: 'sketch' },
  { value: 'orange_cartoon' as const, key: 'orange_cartoon' },
  { value: 'monet' as const, key: 'monet', badge: 'natureRecommended' },
  { value: 'mono_cartoon' as const, key: 'mono_cartoon' },
]
