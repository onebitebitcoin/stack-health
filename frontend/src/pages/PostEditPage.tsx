import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import client from '../api/client'
import { getApiErrorMessage } from '../api/errors'
import type { Post } from '../api/types'
import { MAIN_CATEGORIES, type MainCategory } from './upload/StepMeta'

const SUB_CATEGORIES: Record<MainCategory, string[]> = {
  '가벼운 활동': ['계단 오르기', '산책'],
  '땀 흘리는 운동': ['런닝', '조깅', '웨이트'],
}

export default function PostEditPage() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation('upload')
  const qc = useQueryClient()

  const [mainCategory, setMainCategory] = useState<MainCategory | null>(null)
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [subCategoryInput, setSubCategoryInput] = useState('')
  const [caption, setCaption] = useState('')
  const [workoutStart, setWorkoutStart] = useState('')
  const [workoutEnd, setWorkoutEnd] = useState('')
  const [error, setError] = useState('')

  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ['post', postId],
    queryFn: async () => {
      const res = await client.get<{ data: { post: Post } }>(`/videos/posts/${postId}`)
      return res.data.data.post
    },
    enabled: !!postId,
  })

  useEffect(() => {
    if (!post) return
    setCaption(post.caption ?? '')
    setWorkoutStart(post.workout_start ?? '')
    setWorkoutEnd(post.workout_end ?? '')
    const tags = post.tags ?? []
    const main = tags[0] && (MAIN_CATEGORIES as readonly string[]).includes(tags[0]) ? (tags[0] as MainCategory) : null
    setMainCategory(main)
    setSubCategory(tags[1] ?? null)
  }, [post])

  const mutation = useMutation({
    mutationFn: async () => {
      const tags = [mainCategory, subCategory].filter((v): v is string => Boolean(v))
      const body: Record<string, unknown> = {
        caption,
        tags,
        workout_start: workoutStart || null,
        workout_end: workoutEnd || null,
      }
      const res = await client.patch<{ data: { post: Post } }>(`/videos/posts/${postId}`, body)
      return res.data.data.post
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post', postId] })
      qc.invalidateQueries({ queryKey: ['my-posts'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      toast.success(t('edit.saved'))
      navigate(-1)
    },
    onError: (err) => setError(getApiErrorMessage(err, t('edit.failed'))),
  })

  const MAIN_CATEGORY_LABELS: Record<MainCategory, string> = {
    '가벼운 활동': t('tagChallenge.mainCategoryLight'),
    '땀 흘리는 운동': t('tagChallenge.mainCategorySweat'),
  }
  const SUB_CATEGORY_LABEL_MAP: Record<string, string> = {
    '계단 오르기': t('tagChallenge.subCategoryStairs'),
    '산책': t('tagChallenge.subCategoryWalk'),
    '런닝': t('tagChallenge.subCategoryRunning'),
    '조깅': t('tagChallenge.subCategoryJogging'),
    '웨이트': t('tagChallenge.subCategoryWeight'),
  }
  const getSubLabel = (sub: string): string => SUB_CATEGORY_LABEL_MAP[sub] ?? sub

  function selectMain(cat: MainCategory) {
    setMainCategory(cat); setSubCategory(null); setSubCategoryInput('')
  }
  function selectSub(sub: string) {
    setSubCategory((prev) => (prev === sub ? null : sub)); setSubCategoryInput('')
  }
  function addSubFromInput() {
    const trimmed = subCategoryInput.trim()
    if (!trimmed) return
    setSubCategory(trimmed); setSubCategoryInput('')
  }

  if (isLoading) {
    return <div className="flex h-[100dvh] items-center justify-center bg-theme-page text-theme-muted text-sm">{t('edit.loading')}</div>
  }

  return (
    <div className="relative flex h-[100dvh] flex-col bg-theme-page pb-nav-safe lg:max-w-2xl lg:mx-auto">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <button onClick={() => navigate(-1)} className="flex-shrink-0 p-1 text-theme-muted hover:text-theme-primary" aria-label={t('common:back')}>
          <ChevronLeft size={20} strokeWidth={1.5} />
        </button>
        <span className="text-sm font-semibold text-theme-primary">{t('edit.title')}</span>
      </div>

      <div className="flex flex-1 flex-col px-6 pt-2 pb-6 overflow-y-auto gap-4">
        {/* 카테고리 */}
        <div>
          <p className="mb-2 text-sm font-semibold text-theme-primary">{t('tagChallenge.category')}</p>
          <div className="flex gap-2 mb-3">
            {MAIN_CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => selectMain(cat)} className={`flex-1 rounded-xl py-3 text-sm font-medium transition-colors ${mainCategory === cat ? 'bg-accent text-accent-fg' : 'bg-theme-surface text-theme-muted'}`}>
                {MAIN_CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          {mainCategory && (
            <>
              <p className="mb-2 text-xs font-medium text-theme-subtle">{t('tagChallenge.subCategory')}</p>
              {subCategory && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <div className="flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg">
                    {getSubLabel(subCategory)}
                    <button onClick={() => setSubCategory(null)} className="flex-shrink-0"><X size={11} strokeWidth={2.5} /></button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-3">
                {SUB_CATEGORIES[mainCategory].map((sub) => (
                  <button key={sub} onClick={() => selectSub(sub)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${subCategory === sub ? 'bg-accent/20 text-accent ring-1 ring-accent' : 'bg-theme-surface2 text-theme-muted'}`}>
                    {getSubLabel(sub)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={subCategoryInput} onChange={(e) => setSubCategoryInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubFromInput() } }} placeholder={t('tagChallenge.subCategoryPlaceholder')} className="flex-1 rounded-xl bg-theme-surface px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none" />
                <button onClick={addSubFromInput} disabled={!subCategoryInput.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-theme-surface text-theme-muted disabled:opacity-40"><Plus size={16} /></button>
              </div>
            </>
          )}
        </div>

        {/* 운동 시간대 */}
        <div className="rounded-xl bg-theme-surface px-4 py-3 space-y-2">
          <p className="text-xs font-medium text-theme-muted">{t('caption.workoutTime')} <span className="text-theme-subtle">{t('caption.workoutTimeOptional')}</span></p>
          <div className="flex items-center gap-2">
            <input type="time" value={workoutStart} onChange={(e) => setWorkoutStart(e.target.value)} className="flex-1 rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none focus:ring-2 focus:ring-accent" />
            <span className="text-theme-muted text-sm">~</span>
            <input type="time" value={workoutEnd} onChange={(e) => setWorkoutEnd(e.target.value)} className="flex-1 rounded-lg bg-theme-surface2 px-3 py-2 text-sm text-theme-primary outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>

        {/* 설명 */}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-theme-primary mb-1">{t('caption.captionLabel')} <span className="text-xs font-normal text-theme-subtle">{t('caption.captionOptional')}</span></p>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 140))} maxLength={140} placeholder={t('caption.captionPlaceholder')} rows={3} className="resize-none rounded-xl bg-theme-surface px-4 py-3 text-theme-primary placeholder-theme-subtle outline-none focus:ring-2 focus:ring-accent" />
          <p className="text-right text-xs text-theme-subtle">{caption.length}/140</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button onClick={() => { setError(''); mutation.mutate() }} disabled={mutation.isPending} className="mt-auto w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-60">
          {mutation.isPending ? t('edit.saving') : t('edit.save')}
        </button>
      </div>
    </div>
  )
}
