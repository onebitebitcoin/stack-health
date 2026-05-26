import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Trophy, ImagePlus, Move } from 'lucide-react'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'

const CATEGORIES = [
  { value: 'strength', label: '근력' },
  { value: 'cardio', label: '유산소' },
  { value: 'flexibility', label: '유연성' },
  { value: 'diet', label: '식단' },
  { value: 'challenge', label: '도전' },
  { value: 'social', label: '소셜' },
  { value: 'beginner', label: '입문' },
]

const CROP_INSET = 24

export default function ChallengeCreatePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [form, setForm] = useState({
    title: '',
    description: '',
    reward_title: '',
    condition_value: 10,
    start_date: '',
    end_date: '',
  })
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [error, setError] = useState('')

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [imgReady, setImgReady] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, ox: 0, oy: 0 })
  const previewRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const renderedRef = useRef({ w: 0, h: 0 })

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageSrc(URL.createObjectURL(f))
    setOffset({ x: 0, y: 0 })
    setImgReady(false)
    renderedRef.current = { w: 0, h: 0 }
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const container = previewRef.current
    if (!container) return
    const containerSize = container.getBoundingClientRect().width
    if (!containerSize) return
    const cropSize = containerSize - CROP_INSET * 2
    const scale = Math.max(cropSize / img.naturalWidth, cropSize / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    renderedRef.current = { w, h }
    setOffset({
      x: CROP_INSET + (cropSize - w) / 2,
      y: CROP_INSET + (cropSize - h) / 2,
    })
    setImgReady(true)
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDragging) return
    const container = previewRef.current
    if (!container) return
    const { w, h } = renderedRef.current
    if (!w || !h) return
    const { startX, startY, ox, oy } = dragRef.current
    const containerSize = container.getBoundingClientRect().width
    const cropSize = containerSize - CROP_INSET * 2
    const newX = Math.min(CROP_INSET, Math.max(CROP_INSET + cropSize - w, ox + (e.clientX - startX)))
    const newY = Math.min(CROP_INSET, Math.max(CROP_INSET + cropSize - h, oy + (e.clientY - startY)))
    setOffset({ x: newX, y: newY })
  }

  function onPointerUp() {
    setIsDragging(false)
  }

  async function cropAndUpload(challengeId: number): Promise<void> {
    const img = imgRef.current
    const container = previewRef.current
    if (!img || !container || !imageSrc) return
    const containerSize = container.getBoundingClientRect().width
    const cropSize = containerSize - CROP_INSET * 2
    const scale = Math.max(cropSize / img.naturalWidth, cropSize / img.naturalHeight)
    const srcX = (CROP_INSET - offset.x) / scale
    const srcY = (CROP_INSET - offset.y) / scale
    const srcSize = cropSize / scale

    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 400
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, 400, 400)

    await new Promise<void>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) { resolve(); return }
        const fd = new FormData()
        fd.append('file', blob, 'challenge.jpg')
        try {
          await client.post(`/challenges/${challengeId}/image`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        } catch {
          // image upload failure is non-blocking
        }
        resolve()
      }, 'image/jpeg', 0.82)
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await client.post('/challenges', {
        ...form,
        condition_value: Number(form.condition_value),
        categories: selectedCategories,
      })
      const challengeId = res.data.data.challenge.id
      if (imageSrc) await cropAndUpload(challengeId)
      return res
    },
    onSuccess: () => navigate('/challenges'),
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, '생성에 실패했습니다'))
    },
  })

  function toggleCategory(value: string) {
    setSelectedCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    )
  }

  if (!user) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-theme-page">
        <p className="text-theme-muted text-sm">로그인이 필요합니다</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-theme-muted">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-theme-primary">챌린지 만들기</h1>
      </div>

      <div className="px-4 flex flex-col gap-4">

        {/* 이미지 업로드 */}
        <div>
          <label className="block text-xs text-theme-muted mb-2">챌린지 이미지</label>
          {imageSrc ? (
            <div className="flex flex-col gap-2">
              <div
                ref={previewRef}
                className="relative w-full aspect-square overflow-hidden rounded-2xl bg-black cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt=""
                  draggable={false}
                  onLoad={onImageLoad}
                  className={`absolute max-w-none select-none transition-opacity duration-200 ${imgReady ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    width: renderedRef.current.w ? `${renderedRef.current.w}px` : '100%',
                    height: renderedRef.current.h ? `${renderedRef.current.h}px` : 'auto',
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                />

                {/* 크롭 외곽 어둡게 처리 */}
                <div className="absolute top-0 left-0 right-0 bg-black/50 pointer-events-none" style={{ height: CROP_INSET }} />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 pointer-events-none" style={{ height: CROP_INSET }} />
                <div className="absolute bg-black/50 pointer-events-none" style={{ top: CROP_INSET, bottom: CROP_INSET, left: 0, width: CROP_INSET }} />
                <div className="absolute bg-black/50 pointer-events-none" style={{ top: CROP_INSET, bottom: CROP_INSET, right: 0, width: CROP_INSET }} />

                {/* 크롭 프레임 테두리 */}
                <div
                  className="absolute border border-white/60 pointer-events-none"
                  style={{ inset: CROP_INSET }}
                />

                {/* 드래그 안내 */}
                <div
                  className="absolute pointer-events-none flex items-center justify-center"
                  style={{ inset: CROP_INSET }}
                >
                  <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1">
                    <Move size={12} className="text-white/80" />
                    <span className="text-xs text-white/80">드래그해서 위치 조정</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-theme-muted text-center py-1"
              >
                다른 이미지 선택
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-square rounded-2xl bg-theme-surface flex flex-col items-center justify-center gap-2 text-theme-muted border-2 border-dashed border-theme-border"
            >
              <ImagePlus size={28} strokeWidth={1.5} />
              <span className="text-xs">이미지 선택</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-xs text-theme-muted mb-1">챌린지 제목</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="예: 30일 스쿼트 챌린지"
            className="w-full rounded-xl bg-theme-surface px-3 py-2.5 text-sm text-theme-primary placeholder-theme-subtle outline-none"
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-xs text-theme-muted mb-1">설명</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="챌린지 내용을 입력하세요"
            rows={3}
            className="w-full rounded-xl bg-theme-surface px-3 py-2.5 text-sm text-theme-primary placeholder-theme-subtle outline-none resize-none"
          />
        </div>

        {/* 리워드 타이틀 */}
        <div>
          <label className="block text-xs text-theme-muted mb-1">획득 타이틀</label>
          <div className="flex items-center gap-2 rounded-xl bg-theme-surface px-3 py-2.5">
            <Trophy size={14} className="text-accent flex-shrink-0" />
            <input
              value={form.reward_title}
              onChange={(e) => setForm((f) => ({ ...f, reward_title: e.target.value }))}
              placeholder="예: 스쿼트 마스터"
              className="flex-1 bg-transparent text-sm text-theme-primary placeholder-theme-subtle outline-none"
            />
          </div>
        </div>

        {/* 업로드 목표 횟수 */}
        <div>
          <label className="block text-xs text-theme-muted mb-1">목표 업로드 횟수</label>
          <input
            type="number"
            min={1}
            value={form.condition_value}
            onChange={(e) => setForm((f) => ({ ...f, condition_value: Number(e.target.value) }))}
            className="w-full rounded-xl bg-theme-surface px-3 py-2.5 text-sm text-theme-primary outline-none"
          />
        </div>

        {/* 날짜 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-theme-muted mb-1">시작일</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              className="w-full rounded-xl bg-theme-surface px-3 py-2.5 text-sm text-theme-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-theme-muted mb-1">종료일</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className="w-full rounded-xl bg-theme-surface px-3 py-2.5 text-sm text-theme-primary outline-none"
            />
          </div>
        </div>

        {/* 카테고리 선택 */}
        <div>
          <label className="block text-xs text-theme-muted mb-2">카테고리 (복수 선택 가능)</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => toggleCategory(cat.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedCategories.includes(cat.value)
                    ? 'bg-accent text-accent-fg'
                    : 'bg-theme-surface text-theme-muted'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* 제출 버튼 */}
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !form.title || !form.reward_title || !form.start_date || !form.end_date}
          className="mt-6 mb-4 rounded-2xl bg-accent py-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {mutation.isPending ? '생성 중...' : '챌린지 만들기'}
        </button>
      </div>
    </div>
  )
}
