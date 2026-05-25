import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Trophy } from 'lucide-react'
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

  const mutation = useMutation({
    mutationFn: () =>
      client.post('/challenges', {
        ...form,
        condition_value: Number(form.condition_value),
        categories: selectedCategories,
      }),
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
          className="rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {mutation.isPending ? '생성 중...' : '챌린지 만들기'}
        </button>
      </div>
    </div>
  )
}
