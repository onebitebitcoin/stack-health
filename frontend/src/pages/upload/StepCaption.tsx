import { useRef, type ChangeEvent } from 'react'
import type { RefObject, MutableRefObject } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { srtToTextLines } from '../../utils/subtitles'

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
  caption, setCaption, subtitleText,
  subtitleSize, subtitlePosition, onSubtitleSizeChange, onSubtitlePositionChange,
  workoutStart, setWorkoutStart, workoutEnd, setWorkoutEnd,
  videoHasAudio, recordingDone,
  muteOriginalAudio, setMuteOriginalAudio,
  removeRecordedAudio, setRemoveRecordedAudio,
  error, uploading, onUpload,
}: Props) {
  const hasSubtitle = subtitleText.trim().length > 0
  const previewText = srtToTextLines(subtitleText).find(l => l.trim()) ?? '자막 미리보기'
  const captionRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 pb-6 overflow-y-auto gap-4">
      {/* 운동 시간대 */}
      <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-2">
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

      {/* 오디오 설정 */}
      {(videoHasAudio || recordingDone) && (
        <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-2">
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

      {/* 자막 스타일 (추출된 경우만) */}
      {hasSubtitle && (
        <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-3">
          <p className="text-sm font-semibold text-theme-primary">자막 스타일</p>
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
          <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: '9/16', maxHeight: '180px' }}>
            <div className={`relative w-full h-full flex flex-col items-center ${POSITION_FLEX_CLASS[subtitlePosition]}`}>
              <div className="px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
                <span className={`text-white font-medium ${SIZE_TEXT_CLASS[subtitleSize]}`}>{previewText}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 설명 */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-theme-primary mb-1">설명 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
        <textarea
          ref={captionRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 140))}
          maxLength={140}
          placeholder="오늘의 운동을 간략하게 요약해주세요. #3km #런닝 #오운완"
          rows={4}
          className="resize-none rounded-xl bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
        />
        <p className="text-right text-xs text-theme-subtle">{caption.length}/140</p>
      </div>

      {/* 인증 사진 */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-theme-primary">인증 사진 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
        <p className="text-xs text-theme-muted leading-relaxed mb-2">
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
          <div className="relative">
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
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-theme-border p-4 text-theme-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
          >
            <ImagePlus size={20} strokeWidth={1.5} />
            <span className="text-sm">사진 추가</span>
          </label>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={onUpload}
        disabled={uploading}
        className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
      >
        업로드 시작
      </button>
    </div>
  )
}
