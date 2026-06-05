import { useRef, useEffect, useState, type ChangeEvent } from 'react'
import type { RefObject, MutableRefObject } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { captionFromSubtitleText, srtToTextLines, applyTextLinesToSrt } from '../../utils/subtitles'

type SubtitleSize = 'small' | 'medium' | 'large'
type SubtitlePosition = 'top' | 'center' | 'bottom'

interface Props {
  proofImageRef: RefObject<HTMLInputElement>
  proofPreviewUrl: string | null
  setProofPreviewUrl: (v: string | null) => void
  proofFileRef: MutableRefObject<File | null>
  caption: string
  setCaption: (v: string) => void
  subtitleText: string
  setSubtitleText: (v: string) => void
  subtitleSize: SubtitleSize
  subtitlePosition: SubtitlePosition
  onSubtitleSizeChange: (v: SubtitleSize) => void
  onSubtitlePositionChange: (v: SubtitlePosition) => void
  workoutStart: string
  setWorkoutStart: (v: string) => void
  workoutEnd: string
  setWorkoutEnd: (v: string) => void
  videoHasAudio: boolean
  recordingDone: boolean
  muteOriginalAudio: boolean
  setMuteOriginalAudio: (v: boolean) => void
  removeRecordedAudio: boolean
  setRemoveRecordedAudio: (v: boolean) => void
  error: string
  uploading: boolean
  onUpload: () => void
}

const SIZE_LABELS: Record<SubtitleSize, string> = { small: '소', medium: '중', large: '대' }
const POSITION_LABELS: Record<SubtitlePosition, string> = { top: '상단', center: '중앙', bottom: '하단' }

const SIZE_TEXT_CLASS: Record<SubtitleSize, string> = {
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
}

const POSITION_FLEX_CLASS: Record<SubtitlePosition, string> = {
  top: 'justify-start pt-3',
  center: 'justify-center',
  bottom: 'justify-end pb-3',
}

export default function StepCaption({
  proofImageRef, proofPreviewUrl, setProofPreviewUrl, proofFileRef,
  caption, setCaption, subtitleText, setSubtitleText,
  subtitleSize, subtitlePosition, onSubtitleSizeChange, onSubtitlePositionChange,
  workoutStart, setWorkoutStart, workoutEnd, setWorkoutEnd,
  videoHasAudio, recordingDone,
  muteOriginalAudio, setMuteOriginalAudio,
  removeRecordedAudio, setRemoveRecordedAudio,
  error, uploading, onUpload,
}: Props) {
  const prevSrtRef = useRef(subtitleText)
  const [editLines, setEditLines] = useState(() => srtToTextLines(subtitleText).join('\n'))

  useEffect(() => {
    if (prevSrtRef.current !== subtitleText) {
      prevSrtRef.current = subtitleText
      setEditLines(srtToTextLines(subtitleText).join('\n'))
    }
  }, [subtitleText])

  const hasSubtitle = subtitleText.trim().length > 0
  const previewText = editLines.split('\n').find(l => l.trim()) ?? ''

  function handleEditChange(val: string) {
    setEditLines(val)
    const lines = val.split('\n').map(l => l.trim()).filter(Boolean)
    const newSrt = applyTextLinesToSrt(subtitleText, lines)
    prevSrtRef.current = newSrt
    setSubtitleText(newSrt)
  }

  function handleClearSubtitle() {
    prevSrtRef.current = ''
    setSubtitleText('')
    setEditLines('')
  }

  function applySubtitleToCaption() {
    setCaption(captionFromSubtitleText(subtitleText))
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 overflow-y-auto">
      <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-2 mb-4">
        <p className="text-xs font-medium text-theme-muted">운동 시간대 <span className="text-theme-subtle">(선택)</span></p>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={workoutStart}
            onChange={(e) => setWorkoutStart(e.target.value)}
            className="flex-1 rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-theme-muted text-sm">~</span>
          <input
            type="time"
            value={workoutEnd}
            onChange={(e) => setWorkoutEnd(e.target.value)}
            className="flex-1 rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {(videoHasAudio || recordingDone) && (
        <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-2 mb-4">
          <p className="text-xs font-medium text-theme-muted">오디오 설정</p>
          {videoHasAudio && (
            <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
              <span className="text-sm text-theme-primary">원본 영상 소리 제거</span>
              <button
                type="button"
                role="switch"
                aria-checked={muteOriginalAudio}
                onClick={() => setMuteOriginalAudio(!muteOriginalAudio)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                  muteOriginalAudio ? 'bg-accent' : 'bg-theme-surface2'
                }`}
              >
                <span className={`mt-0.5 ml-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  muteOriginalAudio ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </label>
          )}
          {recordingDone && (
            <label className="flex items-center justify-between gap-3 py-1 cursor-pointer">
              <span className="text-sm text-theme-primary">녹음 음성 제거</span>
              <button
                type="button"
                role="switch"
                aria-checked={removeRecordedAudio}
                onClick={() => setRemoveRecordedAudio(!removeRecordedAudio)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                  removeRecordedAudio ? 'bg-accent' : 'bg-theme-surface2'
                }`}
              >
                <span className={`mt-0.5 ml-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  removeRecordedAudio ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </label>
          )}
        </div>
      )}

      {hasSubtitle && (
        <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-3 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-theme-primary">자막 수정 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
              <p className="mt-1 text-xs leading-relaxed text-theme-muted">텍스트 오타만 수정하세요.</p>
            </div>
            <button
              type="button"
              onClick={handleClearSubtitle}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-theme-muted hover:text-red-400 transition-colors"
            >
              <X size={12} /> 자막 제거
            </button>
          </div>
          <textarea
            value={editLines}
            onChange={(e) => handleEditChange(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl bg-theme-surface2 px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={applySubtitleToCaption}
              disabled={!editLines.trim()}
              className="rounded-lg bg-theme-surface2 px-3 py-2 text-xs font-semibold text-theme-primary disabled:opacity-50"
            >
              설명에 반영
            </button>
          </div>

          <div className="space-y-3 pt-1 border-t border-theme-border">
            <div className="flex items-center gap-3">
              <span className="text-xs text-theme-muted w-10 flex-shrink-0">크기</span>
              <div className="flex gap-1.5">
                {(['small', 'medium', 'large'] as SubtitleSize[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSubtitleSizeChange(s)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      subtitleSize === s
                        ? 'bg-accent text-accent-fg'
                        : 'bg-theme-surface2 text-theme-muted hover:text-theme-primary'
                    }`}
                  >
                    {SIZE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-theme-muted w-10 flex-shrink-0">위치</span>
              <div className="flex gap-1.5">
                {(['top', 'center', 'bottom'] as SubtitlePosition[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onSubtitlePositionChange(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      subtitlePosition === p
                        ? 'bg-accent text-accent-fg'
                        : 'bg-theme-surface2 text-theme-muted hover:text-theme-primary'
                    }`}
                  >
                    {POSITION_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '9/16', maxHeight: '220px' }}>
              <div className={`relative w-full h-full flex flex-col items-center ${POSITION_FLEX_CLASS[subtitlePosition]}`}>
                <div className="px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                  <span className={`text-white font-medium ${SIZE_TEXT_CLASS[subtitleSize]}`}>
                    {previewText || '자막 미리보기'}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-theme-subtle text-center -mt-1">실제 영상 비율과 근사한 미리보기입니다</p>
          </div>
        </div>
      )}

      <p className="mb-2 text-sm font-semibold text-theme-primary">설명 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, 140))}
        maxLength={140}
        placeholder="오늘의 운동을 간략하게 요약해주세요. #3km #런닝 #오운완"
        rows={3}
        className="resize-none rounded-xl bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent mb-1"
      />
      <p className="text-right text-xs text-theme-subtle mb-4">{caption.length}/140</p>

      <p className="mb-1 text-sm font-semibold text-theme-primary">인증 사진 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
      <p className="mb-3 text-xs text-theme-muted leading-relaxed">
        사진을 영상 뒷부분에 붙여서 운동 인증을 강화하세요. 업로드 후 영상 끝에 3초간 표시됩니다.
      </p>
      <input
        ref={proofImageRef}
        id="proof-image-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const f = e.target.files?.[0]
          if (!f) return
          proofFileRef.current = f
          setProofPreviewUrl(URL.createObjectURL(f))
        }}
      />
      {proofPreviewUrl ? (
        <div className="relative mb-4">
          <img src={proofPreviewUrl} alt="사진 미리보기" className="w-full rounded-xl object-cover max-h-48" />
          <button
            onClick={() => {
              proofFileRef.current = null
              setProofPreviewUrl(null)
              if (proofImageRef.current) proofImageRef.current.value = ''
            }}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <label
          htmlFor="proof-image-input"
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-theme-border p-4 text-theme-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
        >
          <ImagePlus size={20} strokeWidth={1.5} />
          <span className="text-sm">사진 추가</span>
        </label>
      )}

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

      <button
        onClick={onUpload}
        disabled={uploading}
        className="mb-4 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
      >
        업로드 시작
      </button>
    </div>
  )
}
