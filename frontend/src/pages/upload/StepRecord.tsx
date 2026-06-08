import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, X, ChevronRight, Loader2, VolumeX, AlertCircle } from 'lucide-react'
import { srtToTextLines, applyTextLinesToSrt } from '../../utils/subtitles'

type VideoAudioStatus = 'idle' | 'analyzing' | 'has_audio' | 'no_audio' | 'error'

interface Props {
  previewUrl: string | null
  recording: boolean
  recordedSeconds: number
  recordingDone: boolean
  progressPct: number
  error: string
  maxSeconds: number
  videoAudioStatus: VideoAudioStatus
  subtitleText: string
  setSubtitleText: (v: string) => void
  subtitlePlainText: string
  subtitleExtracting: boolean
  onExtractFromAudio: () => void
  onClearSubtitle: () => void
  startRecording: () => void
  stopRecording: () => void
  onRetake: () => void
  onNext: () => void
}

export default function StepRecord({
  previewUrl, recording, recordedSeconds, recordingDone,
  progressPct, error, maxSeconds,
  videoAudioStatus,
  subtitleText, setSubtitleText, subtitlePlainText, subtitleExtracting,
  onExtractFromAudio, onClearSubtitle,
  startRecording, stopRecording, onRetake, onNext,
}: Props) {
  const prevSrtRef = useRef(subtitleText)
  const [editLines, setEditLines] = useState(() => srtToTextLines(subtitleText).join('\n'))

  useEffect(() => {
    if (prevSrtRef.current !== subtitleText) {
      prevSrtRef.current = subtitleText
      setEditLines(srtToTextLines(subtitleText).join('\n'))
    }
  }, [subtitleText])

  function handleEditChange(val: string) {
    setEditLines(val)
    const lines = val.split('\n').map((l) => l.trim()).filter(Boolean)
    const newSrt = applyTextLinesToSrt(subtitleText, lines)
    prevSrtRef.current = newSrt
    setSubtitleText(newSrt)
  }

  function handleClearSubtitle() {
    prevSrtRef.current = ''
    setSubtitleText('')
    setEditLines('')
    onClearSubtitle()
  }

  const timeStr = `${String(Math.floor(recordedSeconds / 60)).padStart(2, '0')}:${String(recordedSeconds % 60).padStart(2, '0')}`
  const hasSubtitle = subtitlePlainText.trim() !== ''
  const canProceed = !recording && !subtitleExtracting && videoAudioStatus !== 'analyzing'

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 gap-4 overflow-y-auto">
      {previewUrl && (
        <video
          src={previewUrl}
          className="h-36 w-full rounded-xl object-cover flex-shrink-0"
          muted autoPlay loop playsInline
        />
      )}

      {/* 영상 오디오 분석 결과 */}
      <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-theme-primary">
          자막 <span className="text-xs font-normal text-theme-subtle">(선택)</span>
        </p>

        {videoAudioStatus === 'analyzing' && (
          <div className="flex items-center gap-2 py-1">
            <Loader2 size={14} className="animate-spin text-accent" />
            <span className="text-xs text-theme-muted">영상 음성 분석 중...</span>
          </div>
        )}

        {videoAudioStatus === 'has_audio' && !subtitleExtracting && (
          hasSubtitle ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-theme-muted">추출된 자막 — 오타만 수정하세요</p>
                <button
                  onClick={handleClearSubtitle}
                  className="flex items-center gap-1 text-xs text-theme-muted hover:text-red-400 transition-colors"
                >
                  <X size={11} /> 자막 제거
                </button>
              </div>
              <textarea
                value={editLines}
                onChange={(e) => handleEditChange(e.target.value)}
                rows={4}
                className="w-full resize-none rounded-xl bg-theme-surface2 px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          ) : (
            <p className="text-xs text-theme-muted py-1">자막이 없습니다.</p>
          )
        )}

        {videoAudioStatus === 'no_audio' && (
          <div className="flex items-start gap-2">
            <VolumeX size={14} className="text-theme-muted mt-0.5 flex-shrink-0" />
            <p className="text-xs text-theme-muted leading-relaxed">
              이 영상에는 음성이 없어요. 아래에서 직접 녹음해 자막을 만들어보세요.
            </p>
          </div>
        )}

        {videoAudioStatus === 'error' && (
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-theme-subtle mt-0.5 flex-shrink-0" />
            <p className="text-xs text-theme-subtle leading-relaxed">자막 추출에 실패했어요.</p>
          </div>
        )}

        {subtitleExtracting && videoAudioStatus !== 'analyzing' && (
          <div className="flex items-center gap-2 py-1">
            <Loader2 size={14} className="animate-spin text-accent" />
            <span className="text-xs text-theme-muted">자막 추출 중...</span>
          </div>
        )}
      </div>

      {/* 음성 녹음 섹션 */}
      <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-4">
        <div>
          <p className="font-semibold text-theme-primary">운동 경험을 공유해보세요</p>
          <p className="text-xs text-theme-muted mt-1 leading-relaxed">
            녹음하면 자막으로 영상에 담아드려요. 최대 {maxSeconds}초.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3">
          {recordingDone ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                <Mic size={26} strokeWidth={1.5} className="text-accent" />
              </div>
              <span className="text-xs text-accent font-medium">{timeStr} 녹음 완료</span>
              <button onClick={onRetake} className="flex items-center gap-1 text-xs text-theme-muted">
                <X size={12} /> 다시 녹음
              </button>
            </div>
          ) : !recording ? (
            <button
              onClick={startRecording}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-accent"
            >
              <Mic size={26} strokeWidth={1.5} className="text-black" />
            </button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={stopRecording}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600"
              >
                <MicOff size={26} strokeWidth={1.5} className="text-black" />
              </button>
              <span className="text-sm font-mono text-red-400">{timeStr}</span>
            </div>
          )}

          <div className="w-full h-1.5 rounded-full bg-theme-surface2 overflow-hidden">
            <div
              className="h-full rounded-full bg-red-500 transition-all duration-1000"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {recording && (
            <p className="text-xs text-theme-muted">{maxSeconds - recordedSeconds}초 남음</p>
          )}
        </div>

        {/* 녹음 완료 후 자막 추출 */}
        {recordingDone && !subtitleExtracting && !hasSubtitle && (
          <button
            onClick={onExtractFromAudio}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent/20 border border-accent/30 px-3 py-2.5 text-sm text-accent font-medium hover:bg-accent/30 transition-colors"
          >
            <Mic size={14} />
            녹음 음성으로 자막 만들기
          </button>
        )}

        {recordingDone && subtitleExtracting && (
          <div className="flex items-center gap-2 py-1">
            <Loader2 size={14} className="animate-spin text-accent" />
            <span className="text-xs text-theme-muted">자막 추출 중...</span>
          </div>
        )}

        {recordingDone && hasSubtitle && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-theme-muted">녹음에서 추출한 자막</p>
              <button
                onClick={handleClearSubtitle}
                className="flex items-center gap-1 text-xs text-theme-muted hover:text-red-400 transition-colors"
              >
                <X size={11} /> 자막 제거
              </button>
            </div>
            <textarea
              value={editLines}
              onChange={(e) => handleEditChange(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl bg-theme-surface2 px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="mt-auto flex flex-col items-center gap-3 pb-2">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-40"
        >
          다음 <ChevronRight size={18} />
        </button>
        {!recording && (
          <button onClick={onNext} className="text-sm text-theme-muted underline underline-offset-2 py-1">
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
