import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Loader2, Film, Trophy, Clock, Tag, Captions } from 'lucide-react'
import type { MediaItem } from './StepMedia'

type SubtitleSize = 'small' | 'large'
type SubtitlePosition = 'top' | 'center' | 'bottom'

// StepSubtitle의 자막 미리보기와 동일한 매핑(크기·위치)을 재사용해 실제 burn 결과에 근접시킨다.
const SIZE_TEXT_CLASS: Record<SubtitleSize, string> = {
  small: 'text-[9px]', large: 'text-sm',
}
const POSITION_FLEX_CLASS: Record<SubtitlePosition, string> = {
  top: 'justify-start pt-3', center: 'justify-center', bottom: 'justify-end pb-3',
}

interface Props {
  items: MediaItem[]
  subtitleSource: string
  subtitleLines: string[]
  subtitleSize: SubtitleSize
  subtitlePosition: SubtitlePosition
  estimatedSeconds: number
  mainCategory: string | null
  subCategory: string | null
  challengeTitle: string | null
  workoutStart: string
  workoutEnd: string
  caption: string
  error: string
  uploading: boolean
  onUpload: () => void
}

export default function StepPreview({
  items, subtitleSource, subtitleLines, subtitleSize, subtitlePosition,
  estimatedSeconds, mainCategory, subCategory, challengeTitle,
  workoutStart, workoutEnd, caption, error, uploading, onUpload,
}: Props) {
  const { t } = useTranslation('upload')
  const [active, setActive] = useState(0)
  const current = items[Math.min(active, items.length - 1)]
  const hasSubtitle = subtitleSource !== 'none' && subtitleLines.length > 0
  const previewText = hasSubtitle ? subtitleLines[0] : ''
  const imageCount = items.filter((m) => m.kind === 'image').length
  const videoCount = items.filter((m) => m.kind === 'video').length
  const category = [mainCategory, subCategory].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 gap-4 overflow-y-auto">
      <div>
        <p className="text-sm font-semibold text-theme-primary">{t('preview.title')}</p>
        <p className="text-xs text-theme-muted mt-1">{t('preview.hint')}</p>
      </div>

      {/* 9:16 미리보기 — 활성 미디어 + 자막 오버레이(근사) */}
      <div className="mx-auto w-full max-w-[220px] rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '9/16' }}>
        <div className="relative w-full h-full">
          {current?.kind === 'video' ? (
            <video src={current.previewUrl} className="w-full h-full object-contain" muted playsInline controls />
          ) : current ? (
            <img src={current.previewUrl} className="w-full h-full object-contain" alt="" />
          ) : null}
          {hasSubtitle && (
            <div className={`absolute inset-0 flex flex-col items-center px-2 ${POSITION_FLEX_CLASS[subtitlePosition]}`}>
              <div className="px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                <span className={`text-white font-medium ${SIZE_TEXT_CLASS[subtitleSize]}`}>{previewText}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 미디어 순서 썸네일(2개 이상) */}
      {items.length > 1 && (
        <div className="flex gap-2 justify-center flex-wrap">
          {items.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setActive(i)}
              className={`relative w-11 h-16 rounded-lg overflow-hidden border-2 ${i === active ? 'border-accent' : 'border-transparent'}`}
            >
              {m.kind === 'video' ? (
                <video src={m.previewUrl} className="w-full h-full object-cover" muted playsInline />
              ) : (
                <img src={m.previewUrl} className="w-full h-full object-cover" alt="" />
              )}
              <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl">{i + 1}</span>
            </button>
          ))}
        </div>
      )}

      {/* 요약 */}
      <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-2.5">
        <SummaryRow icon={<Film size={14} />} label={t('preview.media')}
          value={t('preview.mediaCount', { images: imageCount, videos: videoCount, seconds: Math.round(estimatedSeconds) })} />
        {category && (
          <SummaryRow icon={<Tag size={14} />} label={t('preview.category')} value={category} />
        )}
        {challengeTitle && (
          <SummaryRow icon={<Trophy size={14} />} label={t('preview.challenge')} value={challengeTitle} />
        )}
        {(workoutStart || workoutEnd) && (
          <SummaryRow icon={<Clock size={14} />} label={t('preview.workoutTime')} value={`${workoutStart || '—'} ~ ${workoutEnd || '—'}`} />
        )}
        <SummaryRow icon={<Captions size={14} />} label={t('preview.subtitle')}
          value={hasSubtitle ? t('preview.subtitleCount', { count: subtitleLines.length }) : t('preview.subtitleNone')} />
        {caption && (
          <div className="pt-2 border-t border-theme-surface2">
            <p className="text-xs text-theme-muted mb-0.5">{t('preview.caption')}</p>
            <p className="text-sm text-theme-primary whitespace-pre-wrap break-words">{caption}</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="mt-auto pb-2">
        <button
          onClick={onUpload}
          disabled={uploading}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
        >
          {uploading
            ? <><Loader2 size={18} className="animate-spin" /> {t('preview.uploading')}</>
            : <>{t('preview.upload')} <ChevronRight size={18} /></>}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-theme-muted flex-shrink-0">{icon}</span>
      <span className="text-xs text-theme-muted w-14 flex-shrink-0">{label}</span>
      <span className="text-sm text-theme-primary flex-1 text-right break-words">{value}</span>
    </div>
  )
}
