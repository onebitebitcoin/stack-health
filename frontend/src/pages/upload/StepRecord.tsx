import { Mic, MicOff, X, ChevronRight } from 'lucide-react'

interface Props {
  previewUrl: string | null
  recording: boolean
  recordedSeconds: number
  recordingDone: boolean
  progressPct: number
  error: string
  maxSeconds: number
  startRecording: () => void
  stopRecording: () => void
  skipRecording: () => void
  onRetake: () => void
  onNext: () => void
}

export default function StepRecord({
  previewUrl, recording, recordedSeconds, recordingDone,
  progressPct, error, maxSeconds,
  startRecording, stopRecording, skipRecording, onRetake, onNext,
}: Props) {
  const timeStr = `${String(Math.floor(recordedSeconds / 60)).padStart(2, '0')}:${String(recordedSeconds % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-1 flex-col px-6 pt-4 gap-4">
      {previewUrl && (
        <video src={previewUrl} className="h-40 w-full rounded-xl object-cover flex-shrink-0" muted autoPlay loop playsInline />
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
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="mt-auto flex flex-col items-center gap-3 pb-2">
        {recordingDone && (
          <button onClick={onNext} className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg">
            다음 <ChevronRight size={18} />
          </button>
        )}
        <button onClick={skipRecording} className="text-sm text-theme-muted underline underline-offset-2 py-1">
          건너뛰기
        </button>
      </div>
    </div>
  )
}
