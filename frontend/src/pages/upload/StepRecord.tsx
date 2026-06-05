import { useState } from 'react'
import { Mic, MicOff, X, ChevronRight, Volume2, FileVideo, Loader2 } from 'lucide-react'

type Mode = 'video' | 'audio'

interface Props {
  previewUrl: string | null
  recording: boolean
  recordedSeconds: number
  recordingDone: boolean
  progressPct: number
  error: string
  maxSeconds: number
  videoHasAudio?: boolean
  subtitlePlainText: string
  subtitleExtracting: boolean
  onExtractFromVideo: () => void
  onExtractFromAudio: () => void
  onClearSubtitle: () => void
  startRecording: () => void
  stopRecording: () => void
  skipRecording: () => void
  onRetake: () => void
  onNext: () => void
}

export default function StepRecord({
  previewUrl, recording, recordedSeconds, recordingDone,
  progressPct, error, maxSeconds, videoHasAudio,
  subtitlePlainText, subtitleExtracting,
  onExtractFromVideo, onExtractFromAudio, onClearSubtitle,
  startRecording, stopRecording, skipRecording, onRetake, onNext,
}: Props) {
  const [mode, setMode] = useState<Mode>('video')
  const timeStr = `${String(Math.floor(recordedSeconds / 60)).padStart(2, '0')}:${String(recordedSeconds % 60).padStart(2, '0')}`
  const hasSubtitle = subtitlePlainText.trim() !== ''
  const canProceed = (recordingDone || hasSubtitle) && !recording

  function handleModeChange(m: Mode) {
    if (recording) return
    setMode(m)
  }

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 gap-4 overflow-y-auto">
      {previewUrl && (
        <video src={previewUrl} className="h-40 w-full rounded-xl object-cover flex-shrink-0" muted autoPlay loop playsInline />
      )}

      {/* 모드 스위치 */}
      <div className="flex rounded-xl bg-theme-surface p-1 gap-1">
        <button
          type="button"
          onClick={() => handleModeChange('video')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'video' ? 'bg-theme-page text-theme-primary' : 'text-theme-muted'
          }`}
        >
          영상 자막 추출
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('audio')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'audio' ? 'bg-theme-page text-theme-primary' : 'text-theme-muted'
          }`}
        >
          음성 녹음
        </button>
      </div>

      {/* 영상 자막 추출 모드 */}
      {mode === 'video' && (
        <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-3">
          <div>
            <p className="font-semibold text-theme-primary">자막 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
            <p className="text-xs text-theme-muted mt-1 leading-relaxed">영상의 음성을 인식해 자막을 입혀요.</p>
          </div>
          {subtitleExtracting ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span className="text-xs text-theme-muted">자막 추출 중...</span>
            </div>
          ) : hasSubtitle ? (
            <div className="rounded-lg bg-theme-surface2 px-3 py-2.5">
              <p className="text-xs text-theme-primary leading-relaxed line-clamp-3">{subtitlePlainText}</p>
              <button
                onClick={onClearSubtitle}
                className="mt-2 flex items-center gap-1 text-xs text-theme-muted hover:text-red-400 transition-colors"
              >
                <X size={11} /> 자막 제거
              </button>
            </div>
          ) : (
            <button
              onClick={onExtractFromVideo}
              disabled={subtitleExtracting}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-theme-surface2 px-3 py-2.5 text-sm text-theme-muted hover:text-accent transition-colors disabled:opacity-50"
            >
              <FileVideo size={14} />
              영상에서 자막 추출
            </button>
          )}
        </div>
      )}

      {/* 음성 녹음 모드 */}
      {mode === 'audio' && (
        <>
          {videoHasAudio && !recording && !recordingDone && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-500/10 px-3 py-2.5">
              <Volume2 size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-400 leading-relaxed">
                영상에 음성이 감지됐어요. 오디오를 추가하지 않아도 됩니다.
              </p>
            </div>
          )}

          <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-theme-primary">음성 녹음 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
              <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                영상에 입힐 음성이 있으면 녹음하세요. 최대 {maxSeconds}초.
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
                <button onClick={startRecording} className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <Mic size={26} strokeWidth={1.5} className="text-black" />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button onClick={stopRecording} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
                    <MicOff size={26} strokeWidth={1.5} className="text-black" />
                  </button>
                  <span className="text-sm font-mono text-red-400">{timeStr}</span>
                </div>
              )}
              <div className="w-full h-1.5 rounded-full bg-theme-surface2 overflow-hidden">
                <div className="h-full rounded-full bg-red-500 transition-all duration-1000" style={{ width: `${progressPct}%` }} />
              </div>
              {recording && <p className="text-xs text-theme-muted">{maxSeconds - recordedSeconds}초 남음</p>}
            </div>
          </div>

          {/* 녹음 완료 후 자막 추출 */}
          {recordingDone && (
            <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-3">
              <div>
                <p className="font-semibold text-theme-primary">자막 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
                <p className="text-xs text-theme-muted mt-1 leading-relaxed">녹음한 음성으로 자막을 추출해요.</p>
              </div>
              {subtitleExtracting ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 size={14} className="animate-spin text-accent" />
                  <span className="text-xs text-theme-muted">자막 추출 중...</span>
                </div>
              ) : hasSubtitle ? (
                <div className="rounded-lg bg-theme-surface2 px-3 py-2.5">
                  <p className="text-xs text-theme-primary leading-relaxed line-clamp-3">{subtitlePlainText}</p>
                  <button
                    onClick={onClearSubtitle}
                    className="mt-2 flex items-center gap-1 text-xs text-theme-muted hover:text-red-400 transition-colors"
                  >
                    <X size={11} /> 자막 제거
                  </button>
                </div>
              ) : (
                <button
                  onClick={onExtractFromAudio}
                  disabled={subtitleExtracting}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-accent/20 border border-accent/30 px-3 py-2.5 text-sm text-accent font-medium hover:bg-accent/30 transition-colors disabled:opacity-50"
                >
                  <Mic size={14} />
                  녹음 음성에서 자막 추출
                </button>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="mt-auto flex flex-col items-center gap-3 pb-2">
        {canProceed && (
          <button onClick={onNext} className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg">
            다음 <ChevronRight size={18} />
          </button>
        )}
        {!recording && (
          <button onClick={skipRecording} className="text-sm text-theme-muted underline underline-offset-2 py-1">
            건너뛰기
          </button>
        )}
      </div>
    </div>
  )
}
