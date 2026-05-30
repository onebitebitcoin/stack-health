import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Dumbbell, Users, CheckCircle, Trash2, CalendarDays, Edit2, UserCircle } from 'lucide-react'
import client from '../api/client'
import type { Challenge, ChallengeUpdateRequest } from '../api/types'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'
import LoadingScreen from '../components/LoadingScreen'

const CATEGORY_LABELS: Record<string, string> = {
  strength: '근력',
  cardio: '유산소',
  flexibility: '유연성',
  diet: '식단',
  challenge: '도전',
  social: '소셜',
  beginner: '입문',
}

const CATEGORIES = [
  { value: 'strength', label: '근력' },
  { value: 'cardio', label: '유산소' },
  { value: 'flexibility', label: '유연성' },
  { value: 'diet', label: '식단' },
  { value: 'challenge', label: '도전' },
  { value: 'social', label: '소셜' },
  { value: 'beginner', label: '입문' },
]

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [actionError, setActionError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [editCategories, setEditCategories] = useState<string[]>([])

  const { data: challenge, isLoading, isError } = useQuery<Challenge>({
    queryKey: ['challenge', id],
    queryFn: async () => {
      const res = await client.get<{ data: { challenge: Challenge } }>(`/challenges/${id}`)
      return res.data.data.challenge
    },
    enabled: !!id,
  })

  const joinMutation = useMutation({
    mutationFn: () => client.post(`/challenges/${id}/join`),
    onSuccess: () => {
      qc.setQueryData<Challenge>(['challenge', id], (old) =>
        old ? { ...old, joined: true, participant_count: old.participant_count + 1 } : old
      )
      qc.setQueriesData<Challenge[]>(
        { queryKey: ['challenges'] },
        (old) => old?.map((c) => c.id === Number(id) ? { ...c, joined: true, participant_count: c.participant_count + 1 } : c)
      )
      setActionError('')
    },
    onError: (e: unknown) => setActionError(getApiErrorMessage(e, '참여에 실패했습니다')),
  })

  const leaveMutation = useMutation({
    mutationFn: () => client.delete(`/challenges/${id}/leave`),
    onSuccess: () => {
      qc.setQueryData<Challenge>(['challenge', id], (old) =>
        old ? { ...old, joined: false, completed: false, my_upload_count: 0, participant_count: old.participant_count - 1 } : old
      )
      qc.setQueriesData<Challenge[]>(
        { queryKey: ['challenges'] },
        (old) => old?.map((c) => c.id === Number(id) ? { ...c, joined: false, completed: false, my_upload_count: 0, participant_count: c.participant_count - 1 } : c)
      )
      setShowLeaveConfirm(false)
      setActionError('')
    },
    onError: (e: unknown) => {
      setShowLeaveConfirm(false)
      setActionError(getApiErrorMessage(e, '참여 취소에 실패했습니다'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => client.delete(`/challenges/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenges'] }).catch(() => undefined)
      qc.invalidateQueries({ queryKey: ['my-challenges'] }).catch(() => undefined)
      navigate('/challenges', { replace: true })
    },
    onError: (e: unknown) => {
      setShowDeleteConfirm(false)
      setActionError(getApiErrorMessage(e, '삭제에 실패했습니다'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (body: ChallengeUpdateRequest) =>
      client.patch(`/challenges/${id}`, body),
    onSuccess: (_, body) => {
      qc.setQueryData<Challenge>(['challenge', id], (old) =>
        old ? { ...old, ...body } : old
      )
      qc.setQueriesData<Challenge[]>(
        { queryKey: ['challenges'] },
        (old) => old?.map((c) => c.id === Number(id) ? { ...c, ...body } : c)
      )
      setIsEditing(false)
      setActionError('')
    },
    onError: (e: unknown) => setActionError(getApiErrorMessage(e, '수정에 실패했습니다')),
  })

  function startEditing() {
    if (!challenge) return
    setEditDesc(challenge.description ?? '')
    setEditCategories(challenge.categories ?? [])
    setIsEditing(true)
  }

  function toggleEditCategory(value: string) {
    setEditCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    )
  }

  if (isLoading) return <LoadingScreen />

  if (isError || !challenge) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-2 bg-theme-page lg:max-w-2xl lg:mx-auto">
        <p className="text-sm text-theme-muted">챌린지를 찾을 수 없습니다</p>
        <button onClick={() => navigate('/challenges')} className="text-xs text-accent">
          목록으로 돌아가기
        </button>
      </div>
    )
  }

  const isCreator = user && (user.id === challenge.creator_id || user.is_admin)
  const progress = Math.min(100, Math.round((challenge.my_upload_count / challenge.condition_value) * 100))

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe lg:max-w-2xl lg:mx-auto">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-theme-muted flex-shrink-0">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-theme-primary flex-1 truncate">{challenge.title}</h1>
        {isCreator && (
          <>
            <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium flex-shrink-0">
              매니저
            </span>
            <button
              onClick={startEditing}
              className="text-theme-muted flex-shrink-0 p-1"
              aria-label="챌린지 수정"
            >
              <Edit2 size={17} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-400 flex-shrink-0 p-1"
              aria-label="챌린지 삭제"
            >
              <Trash2 size={17} />
            </button>
          </>
        )}
      </div>

      {/* 이미지 */}
      {challenge.image_url && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden bg-theme-surface2 aspect-square">
          <img
            src={challenge.image_url}
            alt=""
            loading="eager"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-4 flex flex-col gap-4 pb-4">
        {/* 획득 타이틀 */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-theme-muted">획득 타이틀</span>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 self-start">
            <Dumbbell size={13} className="text-accent" />
            <span className="text-sm font-semibold text-accent">{challenge.reward_title}</span>
          </div>
        </div>

        {/* 설명 */}
        {challenge.description && (
          <p className="text-sm text-theme-muted leading-relaxed">{challenge.description}</p>
        )}

        {/* 카테고리 */}
        {challenge.categories?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {challenge.categories.map((cat) => (
              <span key={cat} className="rounded-full bg-theme-surface px-2.5 py-1 text-xs text-theme-muted">
                {CATEGORY_LABELS[cat] ?? cat}
              </span>
            ))}
          </div>
        )}

        {/* 챌린지 정보 */}
        <div className="rounded-2xl bg-theme-surface p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-muted flex items-center gap-1.5">
              <CalendarDays size={14} />
              기간
            </span>
            <span className="text-theme-primary font-medium">
              {formatDate(challenge.start_date)} ~ {formatDate(challenge.end_date)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-muted flex items-center gap-1.5">
              <Users size={14} />
              참여자
            </span>
            <span className="text-theme-primary font-medium">{challenge.participant_count}명</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-theme-muted">목표</span>
            <span className="text-theme-primary font-medium">업로드 {challenge.condition_value}회</span>
          </div>
          {challenge.creator_username && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-muted flex items-center gap-1.5">
                <UserCircle size={14} />
                매니저
              </span>
              <span className="text-theme-primary font-medium">@{challenge.creator_username}</span>
            </div>
          )}
        </div>

        {/* 내 진행 상황 */}
        {challenge.joined && (
          <div className="rounded-2xl bg-theme-surface p-4">
            <div className="flex justify-between text-xs text-theme-muted mb-2">
              <span>내 진행 상황</span>
              <span>{challenge.my_upload_count} / {challenge.condition_value}회 ({progress}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-theme-surface2">
              <div
                className="h-2 rounded-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {challenge.completed && (
              <div className="mt-2.5 flex items-center gap-1.5 text-xs text-accent">
                <CheckCircle size={13} />
                <span>타이틀 '{challenge.reward_title}' 획득!</span>
              </div>
            )}
          </div>
        )}

        {actionError && <p className="text-xs text-red-400">{actionError}</p>}

        {/* 액션 영역 */}
        {!challenge.joined && challenge.is_active && (
          <button
            onClick={() => {
              if (!user) { navigate('/login'); return }
              setActionError('')
              joinMutation.mutate()
            }}
            disabled={joinMutation.isPending}
            className="rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {joinMutation.isPending ? '참여 중...' : '챌린지 참여하기'}
          </button>
        )}

        {challenge.joined && !challenge.completed && (
          <div className="flex gap-2">
            <div className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-accent/10 py-3">
              <Dumbbell size={15} className="text-accent" />
              <span className="text-sm font-semibold text-accent">참여 중</span>
            </div>
            <button
              onClick={() => setShowLeaveConfirm(true)}
              className="flex-1 rounded-2xl border border-red-400/30 py-3 text-sm text-red-400"
            >
              참여 취소
            </button>
          </div>
        )}

        {challenge.completed && (
          <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-accent/10 py-3">
            <CheckCircle size={15} className="text-accent" />
            <span className="text-sm font-medium text-accent">완료한 챌린지</span>
          </div>
        )}

        {/* 수정 폼 (생성자/관리자, 수정 모드) */}
        {isCreator && isEditing && (
          <div className="rounded-2xl bg-theme-surface p-4 flex flex-col gap-3 mt-2">
            <p className="text-sm font-semibold text-theme-primary">챌린지 수정</p>
            <div>
              <label className="text-xs text-theme-muted mb-1 block">설명</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-theme-surface2 px-3 py-2 text-sm text-theme-primary placeholder-theme-subtle outline-none resize-none"
                placeholder="챌린지 설명을 입력하세요"
              />
            </div>
            <div>
              <label className="text-xs text-theme-muted mb-1.5 block">카테고리</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => toggleEditCategory(cat.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      editCategories.includes(cat.value)
                        ? 'bg-accent text-accent-fg'
                        : 'bg-theme-surface2 text-theme-muted'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 rounded-xl bg-theme-surface2 py-2.5 text-sm text-theme-muted"
              >
                취소
              </button>
              <button
                onClick={() =>
                  updateMutation.mutate({ description: editDesc, categories: editCategories })
                }
                disabled={updateMutation.isPending}
                className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-fg disabled:opacity-50"
              >
                {updateMutation.isPending ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 삭제 확인 시트 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-theme-surface p-5 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-semibold text-theme-primary">챌린지를 삭제할까요?</p>
              <p className="text-xs text-theme-muted mt-1">삭제하면 목록에서 사라집니다.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-xl bg-theme-surface2 py-2.5 text-sm text-theme-muted"
              >
                취소
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLeaveConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowLeaveConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-theme-surface p-5 flex flex-col gap-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="font-semibold text-theme-primary">참여를 취소할까요?</p>
              <p className="text-xs text-theme-muted mt-1">
                지금까지의 진행 상황이 초기화됩니다. 다시 참여하더라도 처음부터 시작해야 합니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-xl bg-theme-surface2 py-2.5 text-sm text-theme-muted"
              >
                돌아가기
              </button>
              <button
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {leaveMutation.isPending ? '취소 중...' : '참여 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
