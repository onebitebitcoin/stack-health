import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ChevronLeft, Flame, Share2, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LogoMark from '../components/LogoMark'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import { getApiErrorMessage } from '../api/errors'
import { MERGE_POLL_INTERVAL_MS } from '../lib/constants'
import type { Challenge, SubtitleLanguage } from '../api/types'
import { isAxiosError } from 'axios'
import StepSelectVideo from './upload/StepSelectVideo'
import StepTagChallenge, { type MainCategory } from './upload/StepTagChallenge'
import StepRecord from './upload/StepRecord'
import StepCaption from './upload/StepCaption'

function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      setVal(target * progress)
      if (progress < 1) requestAnimationFrame(tick)
      else setVal(target)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  return val
}

const STEPS_KEYS = ['selectVideo', 'tagChallenge', 'record', 'caption'] as const
const MAX_RECORD_SECONDS = 60
const PREFERRED_AUDIO_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'] as const
const AUDIO_BITS_PER_SECOND = 128_000
const PIPELINE_JOB_KEY = 'upload_pipeline_job'
const PIPELINE_JOB_MAX_AGE_MS = 23 * 60 * 60 * 1000

const CONFETTI_COLORS = ['#B5FF2E', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FF9FF3']

const STEP_CONFIG: Record<string, { start: number; ceiling: number; interval: number }> = {
  audio_merge: { start: 73, ceiling: 75,  interval: 1500 },
  image_merge: { start: 76, ceiling: 88,  interval: 5000 },
  subtitle_burn: { start: 86, ceiling: 90, interval: 3000 },
  compress:    { start: 91, ceiling: 94,  interval: 1500 },
  db_save:     { start: 95, ceiling: 98,  interval: 1500 },
}

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

function clearJob() { localStorage.removeItem(PIPELINE_JOB_KEY) }

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return ''
  return PREFERRED_AUDIO_MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

export default function UploadPage() {
  const navigate = useNavigate()
  const { t } = useTranslation('upload')
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const devMode = !!(user?.app_settings?.developer_mode)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [mainCategory, setMainCategoryState] = useState<MainCategory | null>('가벼운 활동')
  const [subCategory, setSubCategoryState] = useState<string | null>(null)
  const [subCategoryInput, setSubCategoryInput] = useState('')
  const [caption, setCaption] = useState('')
  const [subtitleText, setSubtitleText] = useState('')
  const [subtitlePlainText, setSubtitlePlainText] = useState('')
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [subtitlePosition, setSubtitlePosition] = useState<'top' | 'center' | 'bottom'>('bottom')
  const [subtitleLanguage, setSubtitleLanguage] = useState<SubtitleLanguage>('ko')
  const [extractingSubtitles, setExtractingSubtitles] = useState(false)
  const [muteOriginalAudio, setMuteOriginalAudio] = useState(false)
  const [videoAudioStatus, setVideoAudioStatus] = useState<'idle' | 'analyzing' | 'has_audio' | 'no_audio' | 'error'>('idle')
  const [subtitleDebugMetrics, setSubtitleDebugMetrics] = useState<Record<string, unknown> | null>(null)
  const stepTwoInitRef = useRef(false)
  const [hasChallenge, setHasChallenge] = useState<boolean | null>(false)
  const [selectedChallengeId, setSelectedChallengeId] = useState<number | null>(null)
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null)
  const [showChallengeModal, setShowChallengeModal] = useState(false)
  const [challengeSearch, setChallengeSearch] = useState('')
  const [workoutStart, setWorkoutStart] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - 30)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [workoutEnd, setWorkoutEnd] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [shareToken, setShareToken] = useState('')
  const [pointsEarned, setPointsEarned] = useState(0)
  const displayPoints = useCountUp(pointsEarned)
  const [error, setError] = useState('')
  const [limitError, setLimitError] = useState('')

  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null)
  const [pipelineStep, setPipelineStep] = useState<string>('')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)

  const proofImageRef = useRef<HTMLInputElement>(null)
  const proofFileRef = useRef<File | null>(null)
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null)

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

  useEffect(() => {
    if (step === 2 && file && !stepTwoInitRef.current) {
      stepTwoInitRef.current = true
      setVideoAudioStatus('analyzing')
      extractSubtitles('video')
    }
    if (step !== 2) stepTwoInitRef.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, file])

  useEffect(() => {
    const savedJobId = loadJob()
    if (savedJobId) { setPipelineJobId(savedJobId); setPipelineStatus('pending') }
    const handlePageHide = () => { uploadAbortRef.current?.abort() }
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { setUploading(false); setError('') }
    }
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      uploadAbortRef.current?.abort()
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
  }, [])

  const handleJobCompleted = useCallback((pts: number, token: string) => {
    stopPolling(); clearJob(); setPointsEarned(pts); setShareToken(token); setDone(true)
    for (const key of ['my-stats','my-posts','my-weekly-points','history','leaderboard-week','challenges','my-challenges-upload','feed'])
      qc.invalidateQueries({ queryKey: [key] }).catch(() => undefined)
  }, [stopPolling, qc])

  const abortJob = useCallback((msg: string) => {
    stopPolling(); clearJob(); setPipelineJobId(null); setPipelineStatus(null); setError(msg)
  }, [stopPolling])

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await client.get<{ data: { status: string; pipeline_step?: string; points_earned?: number; share_token?: string; error?: string } }>(
        `/videos/upload-job/${jobId}`
      )
      const { status, pipeline_step, points_earned, share_token, error: jobError } = res.data.data
      setPipelineStatus(status)
      if (pipeline_step) {
        setPipelineStep(pipeline_step)
        const cfg = STEP_CONFIG[pipeline_step]
        if (cfg) setUploadProgress((p) => Math.max(p, cfg.start))
      }
      if (status === 'completed') { setUploadProgress(100); handleJobCompleted(points_earned ?? 0, share_token ?? '') }
      else if (status === 'failed') abortJob(jobError || t('error.processingError'))
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404)
        abortJob(t('error.jobNotFound'))
    }
  }, [handleJobCompleted, abortJob, t])

  useEffect(() => {
    if (!pipelineJobId || uploading || done) return
    const cfg = STEP_CONFIG[pipelineStep]
    const ceiling = cfg?.ceiling ?? 88
    const interval = cfg?.interval ?? 1500
    const timer = setInterval(() => setUploadProgress((p) => (p < ceiling ? p + 1 : p)), interval)
    return () => clearInterval(timer)
  }, [pipelineJobId, uploading, done, pipelineStep])

  useEffect(() => {
    if (!pipelineJobId || done) return
    pollJob(pipelineJobId)
    pollTimerRef.current = setInterval(() => pollJob(pipelineJobId), MERGE_POLL_INTERVAL_MS)
    const handleVisibility = () => { if (document.visibilityState === 'visible') pollJob(pipelineJobId) }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pipelineJobId, done, pollJob])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const url = URL.createObjectURL(f)
    const videoEl = document.createElement('video')
    videoEl.preload = 'metadata'
    videoEl.src = url
    videoEl.load() // iOS Safari requires explicit load() to trigger onloadedmetadata
    videoEl.onloadedmetadata = () => {
      // duration may be Infinity on iOS Live Photos / screen recordings — let server validate
      if (isFinite(videoEl.duration) && (videoEl.duration < 10 || videoEl.duration > 60)) {
        URL.revokeObjectURL(url); e.target.value = ''
        const secs = Math.round(videoEl.duration)
        setError(secs < 10
          ? t('error.tooShort', { secs })
          : t('error.tooLong', { secs }))
        return
      }
      setVideoAudioStatus('idle')
      stepTwoInitRef.current = false
      setError(''); setFile(f); setPreviewUrl(url); setStep(1)
    }
    videoEl.onerror = () => { setFile(f); setPreviewUrl(url); setStep(1) }
  }

  function selectMainCategory(cat: MainCategory) {
    setMainCategoryState(cat)
    setSubCategoryState(null)
    setSubCategoryInput('')
  }

  function selectSubCategory(sub: string) {
    setSubCategoryState((prev) => prev === sub ? null : sub)
    setSubCategoryInput('')
  }

  function addSubCategoryFromInput() {
    const trimmed = subCategoryInput.trim()
    if (!trimmed) return
    setSubCategoryState(trimmed)
    setSubCategoryInput('')
  }

  async function startRecording() {
    if (typeof MediaRecorder === 'undefined') { setError(t('error.micUnsupported')); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48_000 },
      })
      streamRef.current = stream; audioChunksRef.current = []; recordedSecondsRef.current = 0
      setRecordedSeconds(0); setRecordingDone(false)
      const mimeType = getSupportedAudioMimeType()
      audioMimeTypeRef.current = mimeType || 'audio/webm'
      const mr = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND })
      mediaRecorderRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
        audioBlobRef.current = new Blob(audioChunksRef.current, { type: audioMimeTypeRef.current })
        setRecording(false); setRecordingDone(true); setMuteOriginalAudio(true)
      }
      mr.start(); setRecording(true)
      intervalRef.current = setInterval(() => {
        setRecordedSeconds((prev) => {
          const next = prev + 1; recordedSecondsRef.current = next
          if (next >= MAX_RECORD_SECONDS) { if (intervalRef.current) clearInterval(intervalRef.current); mediaRecorderRef.current?.stop() }
          return next
        })
      }, 1000)
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'))
        setError(t('error.micNotAllowed'))
      else if (err instanceof DOMException && err.name === 'NotFoundError')
        setError(t('error.micNotFound'))
      else setError(t('error.micRequired'))
    }
  }

  function stopRecording() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    mediaRecorderRef.current?.stop()
  }


  function handleBack() {
    if (step === 0) return
    if (recording) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null
      setRecording(false); audioBlobRef.current = null; setRecordingDone(false); setMuteOriginalAudio(false)
    }
    setStep((prev) => prev - 1)
  }

  function clearChallenge() {
    setSelectedChallengeId(null); setSelectedChallenge(null); setHasChallenge(false)
  }

  function openChallengeModal() {
    setChallengeSearch(''); setShowChallengeModal(true)
  }

  function selectChallenge(c: Challenge) {
    setSelectedChallengeId(c.id); setSelectedChallenge(c); setShowChallengeModal(false); setChallengeSearch('')
  }

  const { data: allChallenges = [] } = useQuery<Challenge[]>({
    queryKey: ['challenges-upload-top10'],
    queryFn: async () => {
      const res = await client.get<{ data: { challenges: Challenge[] } }>('/challenges', { params: { limit: 20 } })
      return res.data.data.challenges
    },
    enabled: showChallengeModal,
  })

  const { data: searchChallenges = [] } = useQuery<Challenge[]>({
    queryKey: ['challenges-upload-search', challengeSearch],
    queryFn: async () => {
      const res = await client.get<{ data: { challenges: Challenge[] } }>('/challenges', { params: { q: challengeSearch, limit: 20 } })
      return res.data.data.challenges
    },
    enabled: showChallengeModal && challengeSearch.length > 0,
  })

  const displayedChallenges = (challengeSearch ? searchChallenges : allChallenges).filter(c => c.joined)

  async function extractSubtitles(source: 'video' | 'audio') {
    if (!file) return
    setError('')
    setExtractingSubtitles(true)
    try {
      const form = new FormData()
      form.append('file', file, file.name)
      if (source === 'audio') {
        const ab = audioBlobRef.current
        if (ab && ab.size > 0) {
          const mime = ab.type || audioMimeTypeRef.current || 'audio/webm'
          form.append('audio', new File([ab], `audio.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime }))
        }
      }
      form.append('subtitle_language', subtitleLanguage)
      const { data: { data: { job_id } } } = await client.post<{ data: { job_id: string } }>(
        '/videos/transcribe-subtitles',
        form,
        { timeout: 180_000 },
      )
      // worker가 처리할 때까지 폴링
      await pollSubtitleJob(job_id)
    } catch (err) {
      setError(getApiErrorMessage(err, t('error.subtitleFailed')))
      setVideoAudioStatus('error')
      setExtractingSubtitles(false)
    }
  }

  async function pollSubtitleJob(jobId: string) {
    const MAX_ATTEMPTS = 60  // 2초 간격 × 60 = 최대 2분
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const res = await client.get<{ data: { status: string; srt: string; plain_text: string; error: string; metrics?: Record<string, unknown> } }>(
          `/videos/subtitle-job/${jobId}`
        )
        const { status, srt, plain_text, error: jobError, metrics } = res.data.data
        if (metrics) setSubtitleDebugMetrics(metrics)
        if (status === 'completed') {
          setSubtitleText(srt)
          setSubtitlePlainText(plain_text)
          setVideoAudioStatus('has_audio')
          setExtractingSubtitles(false)
          return
        }
        if (status === 'skipped') {
          setVideoAudioStatus('no_audio')
          setExtractingSubtitles(false)
          return
        }
        if (status === 'failed') {
          setVideoAudioStatus('error')
          setError(jobError || t('error.subtitleFailed'))
          setExtractingSubtitles(false)
          return
        }
      } catch {
        // 일시적 네트워크 오류 무시, 계속 폴링
      }
    }
    setVideoAudioStatus('error')
    setError(t('error.subtitleTimeout'))
    setExtractingSubtitles(false)
  }

  function clearSubtitle() {
    setSubtitleText('')
    setSubtitlePlainText('')
  }

  async function handleUpload() {
    if (!file) return
    setError(''); setUploading(true); setUploadProgress(0)
    const ctrl = new AbortController(); uploadAbortRef.current = ctrl
    try {
      let duration = 15
      if (previewUrl) {
        const v = document.createElement('video'); v.src = previewUrl
        duration = await new Promise<number>((res) => { v.onloadedmetadata = () => res(Math.round(v.duration)); v.onerror = () => res(15) })
      }
      const form = new FormData()
      form.append('file', file, file.name)
      form.append('duration_sec', String(Math.min(60, Math.max(5, duration))))
      if (caption) form.append('caption', caption)
      if (subtitleText.trim()) {
        form.append('subtitle_srt', subtitleText)
        form.append('subtitle_size', subtitleSize)
        form.append('subtitle_position', subtitlePosition)
        form.append('subtitle_language', subtitleLanguage)
      }
      if (muteOriginalAudio) form.append('mute_video', 'true')
      form.append('tags', JSON.stringify([mainCategory, subCategory].filter((v): v is string => Boolean(v))))
      if (selectedChallengeId != null) form.append('challenge_id', String(selectedChallengeId))
      if (workoutStart) form.append('workout_start', workoutStart)
      if (workoutEnd) form.append('workout_end', workoutEnd)
      if (proofFileRef.current) form.append('proof_image', proofFileRef.current, proofFileRef.current.name)
      const { data: { data: { job_id } } } = await client.post<{ data: { job_id: string } }>(
        '/videos/upload-pipeline', form,
        { signal: ctrl.signal, timeout: 300_000, onUploadProgress: (e) => { if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 70)) } },
      )
      saveJob(job_id); setPipelineJobId(job_id); setPipelineStatus('pending'); setUploadProgress(70)
    } catch (err: unknown) {
      if (isAxiosError(err) && err.code === 'ERR_CANCELED') return
      setError(getApiErrorMessage(err, t('error.uploadFailed')))
    } finally { setUploading(false) }
  }

  // ── Done screen ──
  if (done) {
    const shareUrl = shareToken ? `${window.location.origin}/shorts/${shareToken}` : window.location.origin
    const shareText = `${t('done.shareText')}\n${shareUrl}`
    const confettiItems = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      left: `${(i / 20) * 100}%`,
      delay: `${(i * 0.1) % 1.5}s`,
      duration: `${1.5 + (i % 5) * 0.3}s`,
      size: i % 3 === 0 ? 10 : 6,
    }))
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-6 bg-theme-page px-6 lg:max-w-2xl lg:mx-auto overflow-hidden relative">
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
          {confettiItems.map((c) => (
            <span
              key={c.id}
              className="absolute top-0 rounded-sm animate-confetti-fall"
              style={{ left: c.left, width: c.size, height: c.size, backgroundColor: c.color, animationDuration: c.duration, animationDelay: c.delay }}
            />
          ))}
        </div>
        <div className="w-full max-w-sm rounded-2xl bg-theme-surface p-6 relative z-20">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={20} className="text-orange-400" />
            <span className="text-sm font-semibold text-theme-primary">{t('done.title')}</span>
          </div>
          {caption && <p className="text-sm text-theme-muted mb-4">"{caption}"</p>}
          <div className="flex items-center justify-between rounded-xl bg-theme-surface2 px-4 py-3">
            <span className="text-xs text-theme-muted">{t('done.sweatLabel')}</span>
            <span className="text-lg font-bold text-accent">+{displayPoints.toFixed(1)} L</span>
          </div>
          <p className="text-xs text-theme-subtle mt-3 leading-relaxed">
            {t('done.pendingNote')}
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3 relative z-20">
          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && 'share' in navigator) {
                navigator.share({ title: t('done.title'), text: shareText }).catch(() => undefined)
              } else {
                window.navigator.clipboard?.writeText(shareText).then(() => toast.success(t('error.clipboardCopied'))).catch(() => undefined)
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
          >
            <Share2 size={18} />{t('done.share')}
          </button>
          <button onClick={() => navigate('/')} className="w-full rounded-xl bg-theme-surface py-3 text-sm text-theme-muted">
            {t('done.viewFeed')}
          </button>
        </div>
      </div>
    )
  }

  // ── Processing screen ──
  if (uploading || pipelineJobId) {
    const statusLabel = uploading ? t('processing.uploading') : pipelineStatus === 'processing' ? t('processing.processing') : t('processing.waiting')
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-5 bg-theme-page px-6 lg:max-w-2xl lg:mx-auto">
        <LogoMark size={48} className="animate-bounce text-accent" />
        <p className="text-base font-semibold text-theme-primary">{statusLabel}</p>
        <div className="w-64 flex flex-col items-center gap-1.5">
          <div className="h-1.5 w-full rounded-full bg-theme-surface2">
            <div className="h-1.5 rounded-full bg-accent transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="text-xs text-theme-muted">{uploadProgress}%</span>
        </div>
        {error && (
          <div className="w-full max-w-sm rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 text-center">
            {error}
            <button
              onClick={() => { clearJob(); setError(''); setPipelineJobId(null); setPipelineStatus(null) }}
              className="block mx-auto mt-2 text-xs text-theme-muted underline"
            >{t('processing.reset')}</button>
          </div>
        )}
      </div>
    )
  }

  const progressPct = (recordedSeconds / MAX_RECORD_SECONDS) * 100

  return (
    <div className="relative flex h-[100dvh] flex-col bg-theme-page pb-nav-safe lg:max-w-2xl lg:mx-auto">
      {/* 헤더 + 스텝 바 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          {step > 0 ? (
            <button onClick={handleBack} className="flex-shrink-0 p-1 text-theme-muted hover:text-theme-primary transition-colors" aria-label={t('common:back')}>
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
          ) : (
            <div className="w-7 flex-shrink-0" />
          )}
          <span className="text-sm font-semibold text-theme-primary">{t('pageTitle')}</span>
        </div>
        <div data-testid="step-bar" className="flex items-start">
          {STEPS_KEYS.flatMap((key, i) => {
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
                  {t(`steps.${key}`)}
                </span>
              </div>,
            ]
            if (i < STEPS_KEYS.length - 1) {
              nodes.push(<div key={`line-${i}`} className={`flex-1 h-0.5 mt-3.5 transition-colors ${isCompleted ? 'bg-accent' : 'bg-theme-surface2'}`} />)
            }
            return nodes
          })}
        </div>
      </div>

      {step === 0 && (
        <StepSelectVideo fileInputRef={fileInputRef} error={error} setError={setError} onFileChange={handleFileChange} />
      )}
      {step === 1 && (
        <StepTagChallenge
          previewUrl={previewUrl}
          mainCategory={mainCategory} setMainCategory={selectMainCategory}
          subCategory={subCategory} setSubCategory={selectSubCategory}
          subCategoryInput={subCategoryInput} setSubCategoryInput={setSubCategoryInput}
          addSubCategoryFromInput={addSubCategoryFromInput}
          hasChallenge={hasChallenge} setHasChallenge={setHasChallenge}
          selectedChallenge={selectedChallenge} selectedChallengeId={selectedChallengeId}
          limitError={limitError} setLimitError={setLimitError}
          clearChallenge={clearChallenge} onNext={() => setStep(2)}
          openChallengeModal={openChallengeModal}
          showChallengeModal={showChallengeModal} setShowChallengeModal={setShowChallengeModal}
          challengeSearch={challengeSearch} setChallengeSearch={setChallengeSearch}
          displayedChallenges={displayedChallenges} selectChallenge={selectChallenge}
        />
      )}
      {step === 2 && (
        <StepRecord
          previewUrl={previewUrl} recording={recording} recordedSeconds={recordedSeconds}
          recordingDone={recordingDone} progressPct={progressPct} error={error}
          maxSeconds={MAX_RECORD_SECONDS}
          videoAudioStatus={videoAudioStatus}
          subtitleText={subtitleText}
          setSubtitleText={setSubtitleText}
          subtitlePlainText={subtitlePlainText}
          subtitleExtracting={extractingSubtitles}
          onExtractFromAudio={() => extractSubtitles('audio')}
          onClearSubtitle={clearSubtitle}
          startRecording={startRecording} stopRecording={stopRecording}
          onRetake={() => { audioBlobRef.current = null; setRecordingDone(false); setRecordedSeconds(0); setMuteOriginalAudio(false) }}
          onNext={() => setStep(3)}
          muteOriginalAudio={muteOriginalAudio}
          setMuteOriginalAudio={setMuteOriginalAudio}
          devMode={devMode}
          subtitleDebugMetrics={subtitleDebugMetrics}
        />
      )}
      {step === 3 && (
        <StepCaption
          proofImageRef={proofImageRef} proofPreviewUrl={proofPreviewUrl} setProofPreviewUrl={setProofPreviewUrl}
          proofFileRef={proofFileRef} caption={caption} setCaption={setCaption}
          subtitleText={subtitleText}
          subtitleSize={subtitleSize} subtitlePosition={subtitlePosition}
          onSubtitleSizeChange={setSubtitleSize} onSubtitlePositionChange={setSubtitlePosition}
          subtitleLanguage={subtitleLanguage} onSubtitleLanguageChange={setSubtitleLanguage}
          workoutStart={workoutStart} setWorkoutStart={setWorkoutStart}
          workoutEnd={workoutEnd} setWorkoutEnd={setWorkoutEnd}
          error={error} uploading={uploading} onUpload={handleUpload}
        />
      )}
    </div>
  )
}
