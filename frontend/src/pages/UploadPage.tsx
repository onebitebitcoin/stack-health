import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, ChevronRight, Trophy, Flame, Share2, Mic, MicOff, SkipForward } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import client from '../api/client'
import type { Challenge } from '../api/types'

const ALLOWED_TAGS = ['홈트', '러닝', '요가', '웨이트', '기타'] as const
type Tag = (typeof ALLOWED_TAGS)[number]

const STEPS = ['영상 선택', '태그', '챌린지', '음성 녹음', '설명'] as const
const MAX_RECORD_SECONDS = 15

async function sha256(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getMediaDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement('video')
    const url = URL.createObjectURL(blob)
    el.addEventListener('loadedmetadata', () => { URL.revokeObjectURL(url); resolve(el.duration) })
    el.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(0) })
    el.src = url
    el.load()
  })
}

async function mergeWithFFmpeg(videoFile: File, audio: Blob): Promise<File | null> {
  try {
    const audioDuration = await getMediaDuration(audio)
    if (!audioDuration || audioDuration <= 0) return null

    const ffmpeg = new FFmpeg()
    ffmpeg.on('log', ({ message }) => console.log('[FFmpeg]', message))

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    await ffmpeg.writeFile('video.mp4', await fetchFile(videoFile))
    await ffmpeg.writeFile('audio.webm', await fetchFile(audio))

    const ret = await ffmpeg.exec([
      '-stream_loop', '-1',
      '-i', 'video.mp4',
      '-i', 'audio.webm',
      '-t', String(audioDuration),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      'output.mp4',
    ])

    if (ret !== 0) {
      console.error('[FFmpeg] exec failed with code', ret)
      return null
    }

    const data = await ffmpeg.readFile('output.mp4')
    if (typeof data === 'string') return null
    const plain: ArrayBuffer = new Uint8Array(data).buffer as ArrayBuffer
    return new File([plain], 'merged.mp4', { type: 'video/mp4' })
  } catch (err) {
    console.error('[FFmpeg] merge error:', err)
    return null
  }
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
  const [mergedFile, setMergedFile] = useState<File | null>(null)
  const [ffmpegMerging, setFfmpegMerging] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordedSeconds, setRecordedSeconds] = useState(0)

  // 녹음 관련 ref (stale closure 방지)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []
      setRecordedSeconds(0)

      const mr = new MediaRecorder(stream)
      mediaRecorderRef.current = mr

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioBlobRef.current = blob
        setRecording(false)

        if (file) {
          setFfmpegMerging(true)
          const result = await mergeWithFFmpeg(file, blob)
          setMergedFile(result)
          setFfmpegMerging(false)
        }
        setStep(4)
      }

      mr.start()
      setRecording(true)

      intervalRef.current = setInterval(() => {
        setRecordedSeconds((prev) => {
          const next = prev + 1
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
    setMergedFile(null)
    setStep(4)
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
      const uploadTarget = mergedFile ?? file
      const hash = await sha256(uploadTarget)

      const presignRes = await client.post<{
        data: { upload_url: string; r2_key: string }
      }>('/videos/presigned-url', {
        filename: uploadTarget.name,
        content_type: uploadTarget.type,
        file_size: uploadTarget.size,
        file_hash: hash,
      })
      const { upload_url, r2_key } = presignRes.data.data

      await axios.put(upload_url, uploadTarget, {
        headers: { 'Content-Type': uploadTarget.type },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
        },
      })

      const videoEl = document.createElement('video')
      videoEl.src = previewUrl!
      const duration = await new Promise<number>((resolve) => {
        videoEl.onloadedmetadata = () => resolve(Math.round(videoEl.duration))
      })

      const confirmRes = await client.post<{ data: { points_earned: number } }>('/videos/confirm', {
        r2_key,
        file_hash: hash,
        duration_sec: Math.min(30, Math.max(5, duration)),
        caption: caption || null,
        tags: selectedTags,
        challenge_id: selectedChallengeId,
      })
      setPointsEarned(confirmRes.data.data.points_earned)
      setDone(true)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        '업로드 실패'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  if (done) {
    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    const shareText = `오늘도 운동 증명 완료! +${pointsEarned}pt 적립${caption ? `\n"${caption}"` : ''}\n#StackHealth #ProofOfWorkout\n${window.location.origin}`

    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-theme-page px-6">
        <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-700 p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-orange-400" />
            <span className="text-xs font-bold tracking-widest text-orange-400 uppercase">Proof of Workout</span>
          </div>
          <p className="text-2xl font-bold text-white mb-1">운동 증명 완료</p>
          <p className="text-sm text-zinc-400 mb-5">{today}</p>
          {caption && (
            <p className="text-sm text-zinc-300 mb-5 italic">"{caption}"</p>
          )}
          <div className="flex items-center justify-between rounded-xl bg-zinc-800 px-4 py-3">
            <span className="text-xs text-zinc-400">적립 포인트</span>
            <span className="text-lg font-bold text-accent">+{pointsEarned}pt</span>
          </div>
          <p className="mt-3 text-center text-xs text-zinc-600">Stack Health</p>
        </div>

        <div className="flex w-full max-w-sm flex-col gap-3">
          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && 'share' in navigator) {
                navigator.share({ title: '운동 증명 완료!', text: shareText }).catch(() => undefined)
              } else {
                window.navigator.clipboard?.writeText(shareText).then(() => alert('클립보드에 복사됐어요!')).catch(() => undefined)
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
          >
            <Share2 size={18} />
            운동 증명 공유하기
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full rounded-xl bg-zinc-800 py-3 text-sm text-zinc-300"
          >
            피드 보기
          </button>
        </div>
      </div>
    )
  }

  const progressPct = (recordedSeconds / MAX_RECORD_SECONDS) * 100

  return (
    <div className="relative flex h-[100dvh] flex-col bg-theme-page pb-16">
      {uploading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-theme-page">
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

      {ffmpegMerging && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-theme-page">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-theme-muted">음성과 영상을 합치는 중...</p>
        </div>
      )}

      <div className="flex items-center gap-1 p-4">
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
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
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
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
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

          <div className="mt-auto flex gap-3">
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
            className="mt-auto w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60"
          >
            업로드 시작
          </button>
        </div>
      )}
    </div>
  )
}
