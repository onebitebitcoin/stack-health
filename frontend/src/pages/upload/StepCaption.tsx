import { useRef, type ChangeEvent } from 'react'
import type { RefObject, MutableRefObject } from 'react'
import { FileText, ImagePlus, X } from 'lucide-react'
import { captionFromSubtitleText, subtitleFileToEditableSrt } from '../../utils/subtitles'

interface Props {
  proofImageRef: RefObject<HTMLInputElement>
  proofPreviewUrl: string | null
  setProofPreviewUrl: (v: string | null) => void
  proofFileRef: MutableRefObject<File | null>
  caption: string
  setCaption: (v: string) => void
  subtitleText: string
  setSubtitleText: (v: string) => void
  workoutStart: string
  setWorkoutStart: (v: string) => void
  workoutEnd: string
  setWorkoutEnd: (v: string) => void
  error: string
  uploading: boolean
  onUpload: () => void
}

export default function StepCaption({
  proofImageRef, proofPreviewUrl, setProofPreviewUrl, proofFileRef,
  caption, setCaption, subtitleText, setSubtitleText, workoutStart, setWorkoutStart, workoutEnd, setWorkoutEnd,
  error, uploading, onUpload,
}: Props) {
  const subtitleInputRef = useRef<HTMLInputElement>(null)

  function handleSubtitleFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : ''
      setSubtitleText(subtitleFileToEditableSrt(raw))
      e.target.value = ''
    }
    reader.readAsText(f)
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

      <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-3 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-theme-primary">자막 편집 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
            <p className="mt-1 text-xs leading-relaxed text-theme-muted">텍스트 오타만 고치세요. 시간 코드를 유지하면 영상에 정확히 입혀져요.</p>
          </div>
          <button
            type="button"
            onClick={() => subtitleInputRef.current?.click()}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-theme-surface2 px-3 py-2 text-xs font-medium text-theme-muted hover:text-accent"
          >
            <FileText size={14} /> 불러오기
          </button>
        </div>
        <input
          ref={subtitleInputRef}
          type="file"
          accept=".srt,.vtt,.txt,text/plain,text/vtt"
          className="hidden"
          onChange={handleSubtitleFile}
        />
        <textarea
          value={subtitleText}
          onChange={(e) => setSubtitleText(e.target.value.slice(0, 2000))}
          maxLength={2000}
          placeholder={"1\n00:00:00,000 --> 00:00:03,000\n오늘도 5킬로 뛰었어요."}
          rows={6}
          className="w-full resize-none rounded-xl bg-theme-surface2 px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-theme-subtle">{subtitleText.length}/2000</span>
          <div className="flex gap-2">
            {subtitleText && (
              <button
                type="button"
                onClick={() => setSubtitleText('')}
                className="rounded-lg px-3 py-2 text-xs text-theme-muted hover:bg-theme-surface2"
              >
                비우기
              </button>
            )}
            <button
              type="button"
              onClick={applySubtitleToCaption}
              disabled={!subtitleText.trim()}
              className="rounded-lg bg-theme-surface2 px-3 py-2 text-xs font-semibold text-theme-primary disabled:opacity-50"
            >
              설명에 반영
            </button>
          </div>
        </div>
      </div>

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
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
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
        <button
          onClick={() => proofImageRef.current?.click()}
          className="mb-4 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-theme-border p-4 text-theme-muted hover:border-accent hover:text-accent transition-colors"
        >
          <ImagePlus size={20} strokeWidth={1.5} />
          <span className="text-sm">사진 추가</span>
        </button>
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
