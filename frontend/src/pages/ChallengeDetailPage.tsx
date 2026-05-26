import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Users, CheckCircle, Lock, Trash2, CalendarDays } from 'lucide-react'
import client from '../api/client'
import type { Challenge } from '../api/types'
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
  const [actionError, setActionError] = useState('')

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
      qc.invalidateQueries({ queryKey: ['challenge', id] })
      qc.invalidateQueries({ queryKey: ['challenges'] })
      setActionError('')
    },
    onError: (e: unknown) => setActionError(getApiErrorMessage(e, '참여에 실패했습니다')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => client.delete(`/challenges/${id}`),
    onSuccess: () => navigate('/challenges', { replace: true }),
    onError: (e: unknown) => {
      setShowDeleteConfirm(false)
      setActionError(getApiErrorMessage(e, '삭제에 실패했습니다'))
    },
  })

  if (isLoading) return <LoadingScreen />

  if (isError || !challenge) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-2 bg-theme-page">
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
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-theme-muted flex-shrink-0">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-theme-primary flex-1 truncate">{challenge.title}</h1>
      </div>

      {/* 이미지 */}
      {challenge.image_url && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden">
          <img
            src={challenge.image_url}
            alt=""
            className="w-full aspect-video object-cover"
          />
        </div>
      )}

      <div className="px-4 flex flex-col gap-4 pb-4">
        {/* 리워드 배지 */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 self-start">
          <Trophy size={13} className="text-accent" />
          <span className="text-sm font-semibold text-accent">{challenge.reward_title}</span>
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
          <div className="flex items-center justify-center gap-1.5 py-2">
            <Lock size={14} className="text-theme-subtle" />
            <span className="text-sm text-theme-subtle">참여 중인 챌린지</span>
          </div>
        )}

        {challenge.completed && (
          <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-accent/10 py-3">
            <CheckCircle size={15} className="text-accent" />
            <span className="text-sm font-medium text-accent">완료한 챌린지</span>
          </div>
        )}

        {/* 삭제 (생성자/관리자) */}
        {isCreator && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/30 py-3 text-sm text-red-400 mt-2"
          >
            <Trash2 size={15} />
            챌린지 삭제
          </button>
        )}
      </div>

      {/* 삭제 확인 시트 */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl bg-theme-surface p-5 flex flex-col gap-4"
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
    </div>
  )
}
