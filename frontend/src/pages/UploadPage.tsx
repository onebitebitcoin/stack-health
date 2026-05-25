import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, ChevronRight, ChevronLeft, Trophy, Flame, Share2, Mic, MicOff, SkipForward } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import client from '../api/client'
import type { Challenge } from '../api/types'

const ALLOWED_TAGS = ['홈트', '러닝', '요가', '웨이트', '기타'] as const
type Tag = (typeof ALLOWED_TAGS)[number]

const STEPS = ['영상 선택', '태그', '챌린지', '음성 녹음', '설명'] as const
const MAX_RECORD_SECONDS = 30
const PREFERRED_AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const
const AUDIO_BITS_PER_SECOND = 128_000

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return ''
  }
  return PREFERRED_AUDIO_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  '3gp': 'video/3gpp',
  '3gpp': 'video/3gpp',
  mkv: 'video/x-matroska',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
}

function resolveContentType(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? 'video/mp4'
}

async function sha256(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}


export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [caption, setCaption] = useState('')
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [error, setError] = useState('')

  // 음성 녹음 상태
  const audioBlobRef = useRef<Blob | null>(null)
  const audioMimeTypeRef = useRef('audio/webm')
  const [serverMerging, setServerMerging] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedSeconds, setRecordedSeconds] = useState(0)
  const [debugLogs, setDebugLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    const ts = new Date().toLocaleTimeString('ko-KR', { hour12: false })
    setDebugLogs((prev) => [...prev, `${ts} ${msg}`])
  }

  // 녹음 관련 ref (stale closure 방지)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordedSecondsRef = useRef(0)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

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
      setError('이 브라우저에서는 음성 녹음을 지원하지 않습니다. 건너뛰기를 눌러 영상만 업로드하세요.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48_000,
        },
      })
      streamRef.current = stream
      audioChunksRef.current = []
      recordedSecondsRef.current = 0
      setRecordedSeconds(0)

      const mimeType = getSupportedAudioMimeType()
      audioMimeTypeRef.current = mimeType || 'audio/webm'
      const mr = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      })
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current })
        audioBlobRef.current = blob
        setRecording(false)
        setStep(4)
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
    } catch {
      setError('마이크 접근 권한이 필요합니다.')
    }
  }

  function stopRecording() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    mediaRecorderRef.current?.stop()
  }

  function skipRecording() {
    if (recording) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setRecording(false)
    }
    audioBlobRef.current = null
    setStep(4)
  }

  function handleBack() {
    if (step === 0) return
    if (recording) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setRecording(false)
      audioBlobRef.current = null
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
    try {
      // 1. 영상 서버 경유 R2 업로드 (CORS 우회)
      const contentType = resolveContentType(file)
      addLog(`[Upload] 영상: ${file.name}, ${(file.size / 1024).toFixed(0)}KB, type=${contentType}`)
      const hash = await sha256(file)
      addLog(`[Upload] SHA-256: ${hash.slice(0, 12)}...`)

      const uploadForm = new FormData()
      uploadForm.append('file', file, file.name)
      uploadForm.append('file_hash', hash)

      const uploadRes = await client.post<{
        data: { r2_key: string; cdn_url: string }
      }>('/videos/upload', uploadForm, {
        timeout: 180_000,
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 40))
        },
      })
      let { r2_key } = uploadRes.data.data
      addLog(`[R2] 영상 업로드 완료: ${r2_key}`)

      // 3. 오디오가 녹음됐으면 서버에서 merge
      let finalDurationSec: number | null = null
      const audioBlob = audioBlobRef.current

      if (audioBlob && audioBlob.size > 0) {
        setServerMerging(true)
        const audioMimeType = audioBlob.type || audioMimeTypeRef.current || 'audio/webm'
        const audioExt = audioMimeType.includes('mp4') ? 'mp4' : 'webm'
        addLog(
          `[Merge] 서버 병합 시작: 음성 ${(audioBlob.size / 1024).toFixed(0)}KB (${audioMimeType}, ${AUDIO_BITS_PER_SECOND / 1000}kbps)`,
        )

        const formData = new FormData()
        formData.append('video_r2_key', r2_key)
        formData.append('audio_duration_sec', String(recordedSecondsRef.current))
        formData.append('audio', new File([audioBlob], `audio.${audioExt}`, { type: audioMimeType }))

        try {
          const enqueueRes = await client.post<{
            data: { job_id: string; status: string }
          }>('/videos/merge-audio', formData)
          const jobId = enqueueRes.data.data.job_id
          addLog(`[Merge] 잡 등록 완료: ${jobId}, 워커 처리 대기 중...`)

          // 잡 완료까지 폴링 (최대 120초, 3초 간격)
          const MAX_POLLS = 40
          for (let i = 0; i < MAX_POLLS; i++) {
            await new Promise<void>((resolve) => setTimeout(resolve, 3000))
            const pollRes = await client.get<{
              data: { job_id: string; status: string; r2_key: string; cdn_url: string; error: string }
            }>(`/videos/merge-job/${jobId}`)
            const { status, r2_key: mergedKey, error: jobError } = pollRes.data.data
            addLog(`[Merge] 폴링 ${i + 1}/${MAX_POLLS}: ${status}`)

            if (status === 'completed') {
              r2_key = mergedKey
              finalDurationSec = recordedSecondsRef.current
              addLog(`[Merge] 완료: ${r2_key}, ${finalDurationSec}초`)
              break
            } else if (status === 'failed') {
              addLog(`[Merge] ERROR: 워커 처리 실패 — ${jobError ?? '알 수 없는 오류'}, 원본 영상으로 업로드합니다`)
              break
            }
            if (i === MAX_POLLS - 1) {
              addLog(`[Merge] ERROR: 타임아웃 — 원본 영상으로 업로드합니다`)
            }
          }
        } catch (mergeErr: unknown) {
          const mergeMsg =
            (mergeErr as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            '병합 실패 — 원본 영상으로 업로드합니다'
          addLog(`[Merge] ERROR: ${mergeMsg}`)
        } finally {
          setServerMerging(false)
        }
      }

      setProgress(75)

      // 4. 영상 길이 계산 (merge 결과 우선)
      let duration = finalDurationSec
      if (!duration) {
        const videoEl = document.createElement('video')
        videoEl.src = previewUrl!
        duration = await new Promise<number>((resolve) => {
          videoEl.onloadedmetadata = () => resolve(Math.round(videoEl.duration))
          videoEl.onerror = () => resolve(10)
        })
      }
      addLog(`[Upload] 최종 영상 길이: ${duration}초`)

      // 5. confirm
      const confirmRes = await client.post<{ data: { points_earned: number } }>('/videos/confirm', {
        r2_key,
        file_hash: hash,
        duration_sec: Math.min(30, Math.max(5, duration)),
        caption: caption || null,
        tags: selectedTags,
        challenge_id: selectedChallengeId,
      })
      setProgress(100)
      addLog(`[R2] DB 등록 완료, +${confirmRes.data.data.points_earned}pt`)
      setPointsEarned(confirmRes.data.data.points_earned)
      setDone(true)
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: string } }
        message?: string
        code?: string
      }
      const status = e.response?.status
      const detail = e.response?.data?.detail
      const msg = detail ?? (err instanceof Error ? err.message : '업로드 실패')
      addLog(`[Upload] ERROR: ${msg} (status=${status ?? 'N/A'}, code=${e.code ?? 'N/A'})`)
      setError(msg)
      setServerMerging(false)
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    const shareText = `오늘 운동 완료${caption ? ` — "${caption}"` : ''}`

    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-theme-page px-6">
        <div className="w-full max-w-sm rounded-2xl bg-theme-surface p-6">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-orange-400" />
            <span className="text-sm font-semibold text-theme-primary">오늘 운동 완료</span>
          </div>
          {caption && (
            <p className="text-sm text-theme-muted mb-4">"{caption}"</p>
          )}
          <div className="flex items-center justify-between rounded-xl bg-theme-surface2 px-4 py-3">
            <span className="text-xs text-theme-muted">흘린 땀</span>
            <span className="text-lg font-bold text-accent">+{pointsEarned} ml</span>
          </div>
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
            <Share2 size={18} />
            공유하기
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-theme-surface py-3 text-sm text-theme-muted"
          >
            피드 보기
          </button>
        </div>
      </div>
    )
  }

  const progressPct = (recordedSeconds / MAX_RECORD_SECONDS) * 100

  return (
    <div className="relative flex h-[100dvh] flex-col bg-theme-page pb-nav-safe">
      {uploading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-theme-page px-6">
          <Upload size={48} className="animate-bounce text-accent" />
          <p className="text-lg font-semibold text-theme-primary">업로드 중...</p>
          <div className="h-2 w-64 rounded-full bg-theme-surface2">
            <div
              className="h-2 rounded-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-theme-muted">{progress}%</p>
        </div>
      )}

      {serverMerging && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-theme-page px-6">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-theme-muted">음성과 영상을 합치는 중...</p>
        </div>
      )}

      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        {step > 0 ? (
          <button
            onClick={handleBack}
            className="flex-shrink-0 p-1 text-theme-muted hover:text-theme-primary transition-colors"
            aria-label="이전 단계"
          >
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
        ) : (
          <div className="w-7 flex-shrink-0" />
        )}
        <div data-testid="step-bar" className="flex flex-1 items-center gap-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`h-1 w-full rounded-full transition-colors ${
                  i <= step ? 'bg-accent' : 'bg-theme-surface2'
                }`}
              />
              <span className={`text-xs ${i === step ? 'text-accent' : 'text-theme-subtle'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
          />
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

      {step === 1 && (
        <div className="flex flex-1 flex-col px-6 pt-4">
          {previewUrl && (
            <video
              src={previewUrl}
              className="mb-4 h-48 w-full rounded-xl object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          )}
          <p className="mb-3 font-semibold text-theme-primary">운동 종류를 선택하세요</p>
          <div className="flex flex-wrap gap-2">
            {ALLOWED_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selectedTags.includes(tag)
                    ? 'bg-accent text-accent-fg'
                    : 'bg-theme-surface2 text-theme-muted'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <button
            onClick={() => setStep(2)}
            className="mt-auto mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
          >
            다음 <ChevronRight size={18} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col px-6 pt-4">
          <p className="mb-1 font-semibold text-theme-primary">챌린지 선택 (선택)</p>
          <p className="mb-4 text-xs text-theme-muted">참여 중인 챌린지에 인증하세요</p>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
            <button
              onClick={() => setSelectedChallengeId(null)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                selectedChallengeId === null
                  ? 'bg-accent text-accent-fg'
                  : 'bg-theme-surface text-theme-primary'
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
                  selectedChallengeId === c.id
                    ? 'bg-accent text-accent-fg'
                    : 'bg-theme-surface text-theme-primary'
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
            onClick={() => setStep(3)}
            className="mt-4 mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
          >
            다음 <ChevronRight size={18} />
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-1 flex-col px-6 pt-4 gap-4">
          {previewUrl && (
            <video
              src={previewUrl}
              className="h-48 w-full rounded-xl object-cover"
              muted
              autoPlay
              loop
              playsInline
            />
          )}

          <div className="rounded-xl bg-theme-surface p-4 flex flex-col gap-4">
            <div>
              <p className="font-semibold text-theme-primary">음성 녹음 (선택)</p>
              <p className="text-xs text-theme-muted mt-1">영상을 보며 목소리를 녹음하세요</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg"
                >
                  <Mic size={18} />
                  녹음 시작
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white"
                >
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  <MicOff size={18} />
                  {String(Math.floor(recordedSeconds / 60)).padStart(2, '0')}:
                  {String(recordedSeconds % 60).padStart(2, '0')}
                </button>
              )}

              <div className="w-full h-1.5 rounded-full bg-theme-surface2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-500 transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {recording && (
                <p className="text-xs text-theme-muted">{MAX_RECORD_SECONDS - recordedSeconds}초 남음</p>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="mt-auto mb-4 flex gap-3">
            <button
              onClick={skipRecording}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-theme-surface2 py-3 text-sm text-theme-muted"
            >
              <SkipForward size={16} />
              건너뛰기
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-1 flex-col px-6 pt-4">
          <p className="mb-3 font-semibold text-theme-primary">설명을 추가하세요 (선택)</p>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 140))}
            maxLength={140}
            placeholder="오늘의 운동을 소개해보세요..."
            rows={4}
            className="resize-none rounded-xl bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-right text-xs text-theme-subtle">{caption.length}/140</p>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-auto mb-4 w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
          >
            업로드 시작
          </button>
        </div>
      )}
    </div>
  )
}
