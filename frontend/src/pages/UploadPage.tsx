import { useState, useRef, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, ChevronRight, CheckCircle } from 'lucide-react'
import axios from 'axios'
import client from '../api/client'

const ALLOWED_TAGS = ['홈트', '러닝', '요가', '웨이트', '기타'] as const
type Tag = (typeof ALLOWED_TAGS)[number]

const STEPS = ['영상 선택', '태그', '썸네일', '설명'] as const

async function sha256(file: File): Promise<string> {
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
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

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

  async function handleUpload() {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const hash = await sha256(file)

      const presignRes = await client.post<{
        data: { upload_url: string; r2_key: string }
      }>('/videos/presigned-url', {
        filename: file.name,
        content_type: file.type,
        file_size: file.size,
        file_hash: hash,
      })
      const { upload_url, r2_key } = presignRes.data.data

      await axios.put(upload_url, file, {
        headers: { 'Content-Type': file.type },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100))
        },
      })

      const videoEl = document.createElement('video')
      videoEl.src = previewUrl!
      const duration = await new Promise<number>((resolve) => {
        videoEl.onloadedmetadata = () => resolve(Math.round(videoEl.duration))
      })

      await client.post('/videos/confirm', {
        r2_key,
        file_hash: hash,
        duration_sec: Math.min(60, Math.max(10, duration)),
        caption: caption || null,
        tags: selectedTags,
      })

      setDone(true)
      setTimeout(() => navigate('/'), 1500)
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
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-theme-page">
        <CheckCircle size={64} className="text-accent" />
        <p className="text-xl font-bold text-theme-primary">업로드 완료!</p>
        <p className="text-theme-muted">+50pt 적립됐어요</p>
      </div>
    )
  }

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
            <span className="text-xs">10~60초, 최대 200MB</span>
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
          <p className="mb-3 font-semibold text-theme-primary">썸네일 확인</p>
          {previewUrl && (
            <video
              src={previewUrl}
              className="mb-4 h-64 w-full rounded-xl object-cover"
              muted
              playsInline
            />
          )}
          <p className="text-sm text-theme-muted">영상의 첫 프레임이 썸네일로 사용됩니다.</p>
          <button
            onClick={() => setStep(3)}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-accent-fg"
          >
            이 썸네일로 결정 <ChevronRight size={18} />
          </button>
        </div>
      )}

      {step === 3 && (
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
