import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, ChevronRight, ChevronLeft, Trophy, Flame, Share2, Mic, MicOff, SkipForward, Check, ImagePlus, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { MERGE_POLL_INTERVAL_MS } from '../lib/constants'
import type { Challenge } from '../api/types'
import { isAxiosError } from 'axios'

const ALLOWED_TAGS = ['홈트', '러닝', '요가', '웨이트', '기타'] as const
type Tag = (typeof ALLOWED_TAGS)[number]

const STEPS = ['영상 선택', '태그·챌린지', '음성 녹음', '설명·사진'] as const
const MAX_RECORD_SECONDS = 30
const PREFERRED_AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const
const AUDIO_BITS_PER_SECOND = 128_000
const PIPELINE_JOB_KEY = 'upload_pipeline_job'
const PIPELINE_JOB_MAX_AGE_MS = 23 * 60 * 60 * 1000 // 23h (Redis TTL is 24h)

function saveJob(jobId: string) {
  localStorage.setItem(PIPELINE_JOB_KEY, JSON.stringify({ jobId, savedAt: Date.now() }))
}

function loadJob(): string | null {
  try {
    const raw = localStorage.getItem(PIPELINE_JOB_KEY)
    if (!raw) return null
    const { jobId, savedAt } = JSON.parse(raw) as { jobId: string; savedAt: number }
    if (!jobId || Date.now() - savedAt > PIPELINE_JOB_MAX_AGE_MS) {
      localStorage.removeItem(PIPELINE_JOB_KEY)
      return null
    }
    return jobId
  } catch {
    localStorage.removeItem(PIPELINE_JOB_KEY)
    return null
  }
}

function clearJob() {
  localStorage.removeItem(PIPELINE_JOB_KEY)
}

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return PREFERRED_AUDIO_MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

export default function UploadPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [caption, setCaption] = useState('')
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null)
  const [workoutStart, setWorkoutStart] = useState('')
  const [workoutEnd, setWorkoutEnd] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [error, setError] = useState('')

  // Pipeline job polling state
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Proof image
  const proofImageRef = useRef<HTMLInputElement>(null)
  const proofFileRef = useRef<File | null>(null)
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null)

  // Audio recording
  const audioBlobRef = useRef<Blob | null>(null)
  const audioMimeTypeRef = useRef('audio/webm')
  const [recording, setRecording] = useState(false)
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [recordingDone, setRecordingDone] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordedSecondsRef = useRef(0)

  // On mount: resume pending job from localStorage (checks TTL)
  useEffect(() => {
    const savedJobId = loadJob()
    if (savedJobId) {
      setPipelineJobId(savedJobId)
      setPipelineStatus('pending')
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
  }, [])

  const handleJobCompleted = useCallback((pts: number) => {
    stopPolling()
    clearJob()
    setPointsEarned(pts)
    setDone(true)
    qc.invalidateQueries({ queryKey: ['my-stats'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['my-posts'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['my-weekly-points'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['history'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['rewards-summary'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['leaderboard-week'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['challenges'] }).catch(() => undefined)
    qc.invalidateQueries({ queryKey: ['my-challenges-upload'] }).catch(() => undefined)
  }, [stopPolling, qc])

  const abortJob = useCallback((msg: string) => {
    stopPolling()
    clearJob()
    setPipelineJobId(null)
    setPipelineStatus(null)
    setError(msg)
  }, [stopPolling])

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await client.get<{ data: { status: string; points_earned?: number; error?: string } }>(
        `/videos/upload-job/${jobId}`
      )
      const { status, points_earned, error: jobError } = res.data.data
      setPipelineStatus(status)
      if (status === 'completed') {
        handleJobCompleted(points_earned ?? 0)
      } else if (status === 'failed') {
        abortJob(jobError || '처리 중 오류가 발생했습니다')
      }
      // pending / processing / retrying → keep polling
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        // Job expired or unknown — stop polling, clear storage
        abortJob('업로드 결과를 확인할 수 없습니다. 피드에서 영상을 확인해주세요.')
      }
      // Other network errors → retry silently on next interval
    }
  }, [handleJobCompleted, abortJob])

  // Start/restart polling when pipelineJobId is set
  useEffect(() => {
    if (!pipelineJobId || done) return

    pollJob(pipelineJobId)
    pollTimerRef.current = setInterval(() => pollJob(pipelineJobId), MERGE_POLL_INTERVAL_MS)

    // Immediate re-poll on tab focus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') pollJob(pipelineJobId)
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pipelineJobId, done, pollJob])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
    setStep(1)
  }

  function toggleTag(tag: Tag) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  async function startRecording() {
    if (typeof MediaRecorder === 'undefined') {
      setError('이 브라우저에서는 음성 녹음을 지원하지 않습니다.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48_000 },
      })
      streamRef.current = stream
      audioChunksRef.current = []
      recordedSecondsRef.current = 0
      setRecordedSeconds(0)
      setRecordingDone(false)

      const mimeType = getSupportedAudioMimeType()
      audioMimeTypeRef.current = mimeType || 'audio/webm'
      const mr = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        audioBlobRef.current = new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current })
        setRecording(false)
        setRecordingDone(true)
      }

      mr.start()
      setRecording(true)

      intervalRef.current = setInterval(() => {
        setRecordedSeconds((prev) => {
          const next = prev + 1
          recordedSecondsRef.current = next
          if (next >= MAX_RECORD_SECONDS) {
            if (intervalRef.current) clearInterval(intervalRef.current)
            mediaRecorderRef.current?.stop()
          }
          return next
        })
      }, 1000)
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        setError('마이크 접근이 거부되었습니다. 브라우저 주소창 옆 자물쇠 아이콘을 눌러 마이크를 허용해주세요.')
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('마이크를 찾을 수 없습니다. 장치를 확인해주세요.')
      } else {
        setError('마이크 접근 권한이 필요합니다.')
      }
    }
  }

  function stopRecording() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    mediaRecorderRef.current?.stop()
  }

  function skipRecording() {
    if (recording) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setRecording(false)
    }
    audioBlobRef.current = null
    setRecordingDone(false)
    setError('')
    setStep(3)
  }

  function handleBack() {
    if (step === 0) return
    if (recording) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setRecording(false)
      audioBlobRef.current = null
      setRecordingDone(false)
    }
    setStep((prev) => prev - 1)
  }

  const { data: myChallenges = [] } = useQuery<Challenge[]>({
    queryKey: ['my-challenges-upload'],
    queryFn: async () => {
      const res = await client.get<{ data: { challenges: Challenge[] } }>('/challenges/my')
      return res.data.data.challenges.filter((c) => c.is_active && !c.completed)
    },
  })

  async function handleUpload() {
    if (!file) return
    setError('')
    setUploading(true)
    setUploadProgress(0)

    try {
      // Get video duration
      let duration = 15
      if (previewUrl) {
        const videoEl = document.createElement('video')
        videoEl.src = previewUrl
        duration = await new Promise<number>((resolve) => {
          videoEl.onloadedmetadata = () => resolve(Math.round(videoEl.duration))
          videoEl.onerror = () => resolve(15)
        })
      }

      // Build single multipart request: video + audio + proof + metadata
      const form = new FormData()
      form.append('file', file, file.name)
      form.append('duration_sec', String(Math.min(30, Math.max(5, duration))))
      if (caption) form.append('caption', caption)
      form.append('tags', JSON.stringify(selectedTags))
      if (selectedChallengeId != null) form.append('challenge_id', String(selectedChallengeId))
      if (workoutStart) form.append('workout_start', workoutStart)
      if (workoutEnd) form.append('workout_end', workoutEnd)

      const audioBlob = audioBlobRef.current
      if (audioBlob && audioBlob.size > 0) {
        const audioMimeType = audioBlob.type || audioMimeTypeRef.current || 'audio/webm'
        const audioExt = audioMimeType.includes('mp4') ? 'mp4' : 'webm'
        form.append('audio', new File([audioBlob], `audio.${audioExt}`, { type: audioMimeType }))
        form.append('audio_duration_sec', String(recordedSecondsRef.current))
      }

      if (proofFileRef.current) {
        form.append('proof_image', proofFileRef.current, proofFileRef.current.name)
      }

      const res = await client.post<{ data: { job_id: string } }>(
        '/videos/upload-pipeline',
        form,
        {
          timeout: 300_000,
          onUploadProgress: (e) => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100)) },
        },
      )

      const { job_id } = res.data.data
      saveJob(job_id)
      setPipelineJobId(job_id)
      setPipelineStatus('pending')
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, '업로드 실패'))
    } finally {
      setUploading(false)
    }
  }

  // ── Done screen ──
  if (done) {
    const shareText = '같이 운동하고 비트코인 모으자'
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-theme-page px-6">
        <div className="w-full max-w-sm rounded-2xl bg-theme-surface p-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-orange-400" />
            <span className="text-sm font-semibold text-theme-primary">오늘 운동 완료</span>
          </div>
          {caption && <p className="text-sm text-theme-muted mb-4">"{caption}"</p>}
          <div className="flex items-center justify-between rounded-xl bg-theme-surface2 px-4 py-3">
            <span className="text-xs text-theme-muted">흘린 땀</span>
            <span className="text-lg font-bold text-accent">+{pointsEarned.toFixed(1)} L</span>
          </div>
          <p className="text-xs text-theme-subtle mt-3 leading-relaxed">
            업로드 후 24시간이 지나면 땀이 확정돼요. 그 전에 영상을 삭제하면 취소됩니다.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && 'share' in navigator) {
                navigator.share({ title: '오늘 운동 완료', text: shareText }).catch(() => undefined)
              } else {
                window.navigator.clipboard?.writeText(shareText).then(() => alert('클립보드에 복사됐어요!')).catch(() => undefined)
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
          >
            <Share2 size={18} />공유하기
          </button>
          <button onClick={() => navigate('/')} className="w-full rounded-xl bg-theme-surface py-3 text-sm text-theme-muted">
            피드 보기
          </button>
        </div>
      </div>
    )
  }

  // ── Processing screen (after upload, waiting for worker) ──
  if (pipelineJobId) {
    const statusLabel =
      pipelineStatus === 'processing' ? '영상 처리 중...'
      : pipelineStatus === 'retrying' ? '다시 시도 중...'
      : '업로드 대기 중...'

    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-theme-page px-6">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        <div className="text-center">
          <p className="text-base font-semibold text-theme-primary">{statusLabel}</p>
          <p className="mt-2 text-sm text-theme-muted">
            다른 앱을 사용하셔도 괜찮아요.<br />돌아오시면 결과를 바로 확인할 수 있어요.
          </p>
        </div>
        {error && (
          <div className="w-full max-w-sm rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 text-center">
            {error}
            <button
              onClick={() => { clearJob(); setError(''); setPipelineJobId(null); setPipelineStatus(null) }}
              className="block mx-auto mt-2 text-xs text-theme-muted underline"
            >
              처음으로
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Upload overlay ──
  if (uploading) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-theme-page px-6">
        <Upload size={48} className="animate-bounce text-accent" />
        <p className="text-lg font-semibold text-theme-primary">업로드 중...</p>
        <div className="h-2 w-64 rounded-full bg-theme-surface2">
          <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${uploadProgress}%` }} />
        </div>
        <p className="text-sm text-theme-muted">{uploadProgress}%</p>
        <p className="text-xs text-theme-subtle text-center">
          업로드가 완료되면 앱을 전환해도<br />서버에서 자동으로 처리됩니다.
        </p>
      </div>
    )
  }

  const progressPct = (recordedSeconds / MAX_RECORD_SECONDS) * 100

  return (
    <div className="relative flex h-[100dvh] flex-col bg-theme-page pb-nav-safe">

      {/* 헤더 + 스텝 바 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          {step > 0 ? (
            <button onClick={handleBack} className="flex-shrink-0 p-1 text-theme-muted hover:text-theme-primary transition-colors" aria-label="이전">
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
          ) : (
            <div className="w-7 flex-shrink-0" />
          )}
          <span className="text-sm font-semibold text-theme-primary">영상 업로드</span>
        </div>

        <div data-testid="step-bar" className="flex items-start">
          {STEPS.flatMap((label, i) => {
            const isCompleted = i < step
            const isActive = i === step
            const nodes = [
              <div key={`step-${i}`} className="flex flex-col items-center gap-1.5">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  isCompleted ? 'bg-accent text-accent-fg' : isActive ? 'bg-accent text-accent-fg ring-4 ring-accent/20' : 'bg-theme-surface2 text-theme-subtle'
                }`}>
                  {isCompleted ? <Check size={12} strokeWidth={2.5} /> : <span className="text-[11px] font-bold">{i + 1}</span>}
                </div>
                <span className={`text-[9px] leading-tight text-center font-medium ${isActive ? 'text-accent' : isCompleted ? 'text-theme-muted' : 'text-theme-subtle'}`}>
                  {label}
                </span>
              </div>,
            ]
            if (i < STEPS.length - 1) {
              nodes.push(
                <div key={`line-${i}`} className={`flex-1 h-0.5 mt-3.5 transition-colors ${isCompleted ? 'bg-accent' : 'bg-theme-surface2'}`} />,
              )
            }
            return nodes
          })}
        </div>
      </div>

      {/* Step 0: 영상 선택 */}
      {step === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-theme-border p-12 text-theme-muted transition-colors hover:border-accent hover:text-accent"
          >
            <Upload size={48} strokeWidth={1.5} />
            <span>영상을 선택하세요</span>
            <span className="text-xs">5~30초, 최대 50MB</span>
          </button>
        </div>
      )}

      {/* Step 1: 태그 + 챌린지 */}
      {step === 1 && (
        <div className="flex flex-1 flex-col px-6 pt-2 overflow-y-auto">
          {previewUrl && (
            <video src={previewUrl} className="mb-4 h-36 w-full rounded-xl object-cover flex-shrink-0" muted autoPlay loop playsInline />
          )}
          <p className="mb-2 text-sm font-semibold text-theme-primary">운동 종류</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {ALLOWED_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selectedTags.includes(tag) ? 'bg-accent text-accent-fg' : 'bg-theme-surface2 text-theme-muted'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <p className="mb-2 text-sm font-semibold text-theme-primary">챌린지 선택 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
          <div className="flex flex-col gap-2 mb-4">
            <button
              onClick={() => setSelectedChallengeId(null)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                selectedChallengeId === null ? 'bg-accent text-accent-fg' : 'bg-theme-surface text-theme-primary'
              }`}
            >
              <Trophy size={16} strokeWidth={1.5} />
              <span className="text-sm font-medium">챌린지 없음</span>
            </button>
            {myChallenges.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChallengeId(c.id)}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                  selectedChallengeId === c.id ? 'bg-accent text-accent-fg' : 'bg-theme-surface text-theme-primary'
                }`}
              >
                <Trophy size={16} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className={`text-xs mt-0.5 ${selectedChallengeId === c.id ? 'text-accent-fg/70' : 'text-theme-muted'}`}>
                    {c.my_upload_count}/{c.condition_value}회 · {c.reward_title}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep(2)}
            className="mt-auto mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg flex-shrink-0"
          >
            다음 <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Step 2: 음성 녹음 */}
      {step === 2 && (
        <div className="flex flex-1 flex-col px-6 pt-4 gap-4">
          {previewUrl && (
            <video src={previewUrl} className="h-40 w-full rounded-xl object-cover flex-shrink-0" muted autoPlay loop playsInline />
          )}
          <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-theme-primary">음성 녹음 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
              <p className="text-xs text-theme-muted mt-1 leading-relaxed">
                목소리로 오늘 운동을 기록해보세요. 최대 {MAX_RECORD_SECONDS}초.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3">
              {recordingDone ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                    <Mic size={26} strokeWidth={1.5} className="text-accent" />
                  </div>
                  <span className="text-xs text-accent font-medium">
                    {String(Math.floor(recordedSeconds / 60)).padStart(2, '0')}:{String(recordedSeconds % 60).padStart(2, '0')} 녹음 완료
                  </span>
                  <button
                    onClick={() => { audioBlobRef.current = null; setRecordingDone(false); setRecordedSeconds(0) }}
                    className="flex items-center gap-1 text-xs text-theme-muted"
                  >
                    <X size={12} /> 다시 녹음
                  </button>
                </div>
              ) : !recording ? (
                <button onClick={startRecording} className="flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                  <Mic size={26} strokeWidth={1.5} className="text-white" />
                </button>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <button onClick={stopRecording} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600">
                    <MicOff size={26} strokeWidth={1.5} className="text-white" />
                  </button>
                  <span className="text-sm font-mono text-red-400">
                    {String(Math.floor(recordedSeconds / 60)).padStart(2, '0')}:{String(recordedSeconds % 60).padStart(2, '0')}
                  </span>
                </div>
              )}
              <div className="w-full h-1.5 rounded-full bg-theme-surface2 overflow-hidden">
                <div className="h-full rounded-full bg-red-500 transition-all duration-1000" style={{ width: `${progressPct}%` }} />
              </div>
              {recording && <p className="text-xs text-theme-muted">{MAX_RECORD_SECONDS - recordedSeconds}초 남음</p>}
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="mt-auto flex gap-3 pb-2">
            <button
              onClick={skipRecording}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-theme-surface2 py-3 text-sm text-theme-muted"
            >
              <SkipForward size={16} />건너뛰기
            </button>
            {recordingDone && (
              <button
                onClick={() => setStep(3)}
                className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
              >
                다음 <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: 설명 + 사진 */}
      {step === 3 && (
        <div className="flex flex-1 flex-col px-6 pt-4 overflow-y-auto">
          <p className="mb-2 text-sm font-semibold text-theme-primary">설명 <span className="text-xs font-normal text-theme-subtle">(선택)</span></p>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 140))}
            maxLength={140}
            placeholder="오늘의 운동을 소개해보세요..."
            rows={3}
            className="resize-none rounded-xl bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent mb-1"
          />
          <p className="text-right text-xs text-theme-subtle mb-4">{caption.length}/140</p>

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

          <p className="mb-2 text-sm font-semibold text-theme-primary">인증 사진 <span className="text-xs font-normal text-theme-subtle">(선택 — 영상 끝에 3초 표시)</span></p>
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
                onClick={() => { proofFileRef.current = null; setProofPreviewUrl(null); if (proofImageRef.current) proofImageRef.current.value = '' }}
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
            onClick={handleUpload}
            disabled={uploading}
            className="mb-4 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
          >
            업로드 시작
          </button>
        </div>
      )}
    </div>
  )
}
