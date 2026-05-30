import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Dumbbell, Users, CheckCircle, Trash2, CalendarDays,
  Edit2, UserCircle, Droplets, Play, TrendingUp, CircleCheck,
} from 'lucide-react'
import client from '../api/client'
import type { Challenge, ChallengeParticipant, ChallengeVideo } from '../api/types'
import { toSweatL } from '../utils/sweat'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../store/auth'
import LoadingScreen from '../components/LoadingScreen'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function DescriptionText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/)
  return (
    <p className="text-sm text-theme-muted leading-relaxed whitespace-pre-wrap break-words select-text">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">
            {part}
          </a>
        ) : part
      )}
    </p>
  )
}

function SweatCount({ count, total }: { count: number; total: number }) {
  return (
    <span className="flex items-center gap-0.5 text-xs text-theme-muted">
      <Droplets size={11} className="text-accent" />
      {toSweatL(count)} / {toSweatL(total)}
    </span>
  )
}

export default function ChallengeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [actionError, setActionError] = useState('')
  const [activeTab, setActiveTab] = useState<'info' | 'manager'>('info')

  const { data: challenge, isLoading, isError } = useQuery<Challenge>({
    queryKey: ['challenge', id],
    queryFn: async () => {
      const res = await client.get<{ data: { challenge: Challenge } }>(`/challenges/${id}`)
      return res.data.data.challenge
    },
    enabled: !!id,
  })

  const isCreator = !!user && !!challenge && (user.id === challenge.creator_id || user.is_admin)
  const managerEnabled = isCreator && activeTab === 'manager'

  const { data: participants = [], isLoading: participantsLoading } = useQuery<ChallengeParticipant[]>({
    queryKey: ['challenge-participants', id],
    queryFn: async () => {
      const res = await client.get<{ data: { participants: ChallengeParticipant[] } }>(`/challenges/${id}/participants`)
      return res.data.data.participants
    },
    enabled: managerEnabled,
  })

  const { data: challengeVideos = [], isLoading: videosLoading } = useQuery<ChallengeVideo[]>({
    queryKey: ['challenge-videos', id],
    queryFn: async () => {
      const res = await client.get<{ data: { videos: ChallengeVideo[] } }>(`/challenges/${id}/videos`)
      return res.data.data.videos
    },
    enabled: managerEnabled,
  })

  const completeMutation = useMutation({
    mutationFn: (userId: number) =>
      client.patch(`/challenges/${id}/participants/${userId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['challenge-participants', id] }).catch(() => undefined)
    },
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
      qc.invalidateQueries({ queryKey: ['my-challenges'] }).catch(() => undefined)
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
      qc.invalidateQueries({ queryKey: ['my-challenges'] }).catch(() => undefined)
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

  const progress = Math.min(100, Math.round((challenge.my_upload_count / challenge.condition_value) * 100))
  const completedCount = participants.filter((p) => p.completed_at !== null).length
  const avgProgress = participants.length > 0
    ? Math.round(participants.reduce((sum, p) => sum + p.progress, 0) / participants.length)
    : 0

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
              onClick={() => navigate(`/challenges/${id}/edit`)}
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

      {/* 탭 (매니저만) */}
      {isCreator && (
        <div className="px-4 mb-2 flex gap-1">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'bg-accent text-accent-fg'
                : 'bg-theme-surface text-theme-muted'
            }`}
          >
            정보
          </button>
          <button
            onClick={() => setActiveTab('manager')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'manager'
                ? 'bg-accent text-accent-fg'
                : 'bg-theme-surface text-theme-muted'
            }`}
          >
            매니저
          </button>
        </div>
      )}

      {/* ─── 정보 탭 ─── */}
      {activeTab === 'info' && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* 이미지 */}
          {challenge.image_url && (
            <div className="flex justify-center pt-1">
              <div className="h-20 w-20 rounded-full overflow-hidden bg-theme-surface2 ring-2 ring-theme-border">
                <img
                  src={challenge.image_url}
                  alt=""
                  loading="eager"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

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
            <DescriptionText text={challenge.description} />
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
            {challenge.recruit_end && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-theme-muted flex items-center gap-1.5">
                  <CalendarDays size={14} />
                  모집 기간
                </span>
                <span className="text-theme-primary font-medium">
                  {challenge.recruit_start ? formatDate(challenge.recruit_start) + ' ~ ' : '~ '}
                  {formatDate(challenge.recruit_end)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-muted flex items-center gap-1.5">
                <Users size={14} />
                참여자
              </span>
              <span className="text-theme-primary font-medium">
                {challenge.participant_count}명
                {challenge.max_participants ? ` / ${challenge.max_participants}명` : ''}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-theme-muted">모집 상태</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                challenge.is_recruiting !== false
                  ? 'bg-accent/15 text-accent'
                  : 'bg-theme-surface2 text-theme-muted'
              }`}>
                {challenge.is_recruiting !== false ? '모집 중' : '마감'}
              </span>
            </div>
            {challenge.goal_description && (
              <div className="flex items-start justify-between text-sm gap-4">
                <span className="text-theme-muted flex-shrink-0">목표</span>
                <span className="text-theme-primary font-medium text-right">{challenge.goal_description}</span>
              </div>
            )}
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
                <span className="flex items-center gap-1">
                  <Droplets size={11} className="text-accent" />
                  내 땀의 양
                </span>
                <span>{toSweatL(challenge.my_upload_count)} / {toSweatL(challenge.condition_value)} ({progress}%)</span>
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

          {/* 액션 버튼 */}
          {!challenge.joined && challenge.is_active && challenge.is_recruiting !== false && (
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
          {!challenge.joined && challenge.is_active && challenge.is_recruiting === false && (
            <div className="rounded-2xl bg-theme-surface py-3 text-sm font-medium text-theme-muted text-center">
              모집 마감
            </div>
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

        </div>
      )}

      {/* ─── 매니저 탭 ─── */}
      {activeTab === 'manager' && isCreator && (
        <div className="flex flex-col gap-5 pb-6">
          {/* 통계 */}
          <div className="px-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-theme-surface p-3 text-center">
              <Users size={16} className="text-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-theme-primary">{participants.length}</p>
              <p className="text-[10px] text-theme-muted">참여자</p>
            </div>
            <div className="rounded-xl bg-theme-surface p-3 text-center">
              <CheckCircle size={16} className="text-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-theme-primary">{completedCount}</p>
              <p className="text-[10px] text-theme-muted">완료</p>
            </div>
            <div className="rounded-xl bg-theme-surface p-3 text-center">
              <TrendingUp size={16} className="text-accent mx-auto mb-1" />
              <p className="text-lg font-bold text-theme-primary">{avgProgress}%</p>
              <p className="text-[10px] text-theme-muted">평균 달성</p>
            </div>
          </div>

          {/* 참여자 목록 */}
          <div className="px-4">
            <h2 className="text-sm font-semibold text-theme-primary mb-2">참여자 목록</h2>
            {participantsLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : participants.length === 0 ? (
              <p className="text-sm text-theme-muted py-6 text-center">아직 참여자가 없어요.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {participants.map((p) => (
                  <div key={p.user_id} className="rounded-xl bg-theme-surface px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-theme-primary">{p.username}</span>
                      <div className="flex items-center gap-2">
                        <SweatCount count={p.upload_count} total={p.condition_value} />
                        <button
                          onClick={() => completeMutation.mutate(p.user_id)}
                          disabled={completeMutation.isPending}
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50 ${
                            p.completed_at !== null
                              ? 'bg-accent/15 text-accent'
                              : 'bg-theme-surface2 text-theme-muted hover:bg-accent/10 hover:text-accent'
                          }`}
                        >
                          <CircleCheck size={11} strokeWidth={2} />
                          {p.completed_at !== null ? '완료' : '완료 처리'}
                        </button>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-theme-surface2">
                      <div
                        className="h-1.5 rounded-full bg-accent transition-all"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 업로드된 영상 */}
          <div className="px-4">
            <h2 className="text-sm font-semibold text-theme-primary mb-2">
              업로드된 영상
              {challengeVideos.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-theme-muted">{challengeVideos.length}개</span>
              )}
            </h2>
            {videosLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            ) : challengeVideos.length === 0 ? (
              <p className="text-sm text-theme-muted py-6 text-center">아직 업로드된 영상이 없어요.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {challengeVideos.map((v) => (
                  <div
                    key={v.post_id}
                    className="relative aspect-square rounded-xl overflow-hidden bg-theme-surface2"
                  >
                    {v.thumbnail_url ? (
                      <img
                        src={v.thumbnail_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play size={18} className="text-theme-muted" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                      <p className="text-[10px] text-white truncate">@{v.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 삭제 확인 */}
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

      {/* 참여 취소 확인 */}
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
