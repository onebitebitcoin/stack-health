import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LogOut, Droplets, ShieldCheck, Settings,
  ChevronLeft, ChevronRight, ChevronDown, Flame, Heart, Eye, ArrowLeft, Award, Share2, Trash2, Play,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import type { MyStats, HistoryResponse, HistoryWorkoutPost, Claim } from '../api/types'
import client from '../api/client'
import LoadingScreen from '../components/LoadingScreen'

const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function getFirstDayIndex(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const queryClient = useQueryClient()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedPosts, setSelectedPosts] = useState<HistoryWorkoutPost[]>([])
  const [videoIdx, setVideoIdx] = useState(0)
  const [showWeeklyHistory, setShowWeeklyHistory] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

  const { data: myStats, isLoading } = useQuery<MyStats>({
    queryKey: ['my-stats'],
    queryFn: async () => {
      const res = await client.get<{ data: MyStats }>('/users/me/stats')
      return res.data.data
    },
    enabled: !!user,
  })

  const { data: claimsData } = useQuery<Claim[]>({
    queryKey: ['my-claims'],
    queryFn: async () => {
      const res = await client.get<{ data: { claims: Claim[] } }>('/rewards/claims')
      return res.data.data.claims
    },
    enabled: !!user && showWeeklyHistory,
  })

  const { data: myPostsData, isLoading: myPostsLoading } = useQuery<{ id: number; cdn_url: string; caption: string | null; created_at: string; like_count: number; view_count: number }[]>({
    queryKey: ['my-posts'],
    queryFn: async () => {
      const res = await client.get<{ data: { posts: { id: number; cdn_url: string; caption: string | null; created_at: string; like_count: number; view_count: number }[] } }>('/videos/my-posts')
      return res.data.data.posts
    },
    enabled: !!user,
  })

  const deleteMutation = useMutation({
    mutationFn: (postId: number) => client.delete(`/videos/posts/${postId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-posts'] })
      queryClient.invalidateQueries({ queryKey: ['history'] })
      queryClient.invalidateQueries({ queryKey: ['my-stats'] })
      setDeleteConfirmId(null)
    },
  })

  const { data: historyData, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ['history', year, month],
    queryFn: async () => {
      const res = await client.get('/history', { params: { year, month } })
      return res.data.data
    },
    staleTime: 60_000,
    enabled: !!user,
  })

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
    setSelectedDate(null)
  }

  function nextMonth() {
    const ty = now.getFullYear(), tm = now.getMonth() + 1
    if (year > ty || (year === ty && month >= tm)) return
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
    setSelectedDate(null)
  }

  function openDay(dateStr: string, posts: HistoryWorkoutPost[]) {
    setSelectedDate(dateStr)
    setSelectedPosts(posts)
    setVideoIdx(0)
  }

  function closeModal() {
    setSelectedDate(null)
    setSelectedPosts([])
    setVideoIdx(0)
  }

  const totalDays = getDaysInMonth(year, month)
  const firstIdx = getFirstDayIndex(year, month)
  const workoutDays = historyData?.workout_days ?? {}
  const streak = historyData?.streak ?? 0
  const totalWorkoutDays = historyData?.total_days ?? 0
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const todayNum = isCurrentMonth ? now.getDate() : -1
  const confirmedSweatPoints = myStats?.total_points ?? 0
  const pendingSweatPoints = myStats?.queued_points ?? 0
  const displayedSweatPoints = confirmedSweatPoints + pendingSweatPoints
  const weekPoints = myStats?.week_points ?? 0
  const weekQueuedPoints = myStats?.week_queued_points ?? 0


  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstIdx; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= totalDays; d++) cells.push({ day: d, dateStr: `${year}-${pad2(month)}-${pad2(d)}` })
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null })

  if (isLoading) return <LoadingScreen />

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">

      {/* ── 헤더 ── */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-theme-surface2 text-sm font-bold text-theme-primary">
          {user?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-theme-primary leading-tight truncate">
              {user?.username}
            </p>
            {user?.is_admin && (
              <span className="flex-shrink-0 flex items-center gap-0.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                <ShieldCheck size={9} />
                관리자
              </span>
            )}
          </div>
          <p className="text-xs text-theme-muted truncate">{user?.email}</p>
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="text-theme-muted hover:text-theme-primary transition-colors p-1"
          aria-label="설정"
        >
          <Settings size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => { logout(); window.location.href = '/login' }}
          className="text-theme-muted hover:text-red-400 transition-colors p-1"
          aria-label="로그아웃"
        >
          <LogOut size={16} strokeWidth={1.5} />
        </button>
      </div>

      {/* ── 관리자 버튼 ── */}
      {user?.is_admin && (
        <div className="mx-4 mb-3">
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent/10 border border-accent/30 px-4 py-3 text-sm font-semibold text-accent hover:bg-accent/20 transition-colors"
          >
            <ShieldCheck size={15} />
            관리자 페이지로 이동
          </button>
        </div>
      )}

      {/* ── 땀 카드 ── */}
      <button
        onClick={() => setShowWeeklyHistory((v) => !v)}
        className={`mx-4 flex flex-col items-center gap-2 w-[calc(100%-2rem)] bg-theme-surface px-6 py-6 active:scale-[0.98] transition-transform ${showWeeklyHistory ? 'rounded-t-2xl mb-0' : 'rounded-2xl mb-4'}`}
      >
        <span className="text-xs text-theme-muted">이번 주 흘린 땀</span>
        <Droplets size={30} className="text-blue-400" strokeWidth={1.5} />
        <span className="text-5xl font-bold font-mono text-theme-primary">
          {(weekPoints / 100).toFixed(2)}
          <span className="text-xl font-medium text-theme-muted ml-1">L</span>
        </span>
        {weekQueuedPoints > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-theme-surface2 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs text-theme-muted">+{(weekQueuedPoints / 100).toFixed(2)}L 대기 중</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-theme-muted mt-1">
          <span>주간 이력</span>
          <ChevronDown size={13} className={`transition-transform ${showWeeklyHistory ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* ── 주간 이력 collapse ── */}
      {showWeeklyHistory && (
        <div className="mx-4 mb-4 rounded-b-2xl bg-theme-surface overflow-hidden border-t border-theme-border">
          {/* 누적 합계 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-theme-border">
            <span className="text-xs font-medium text-theme-muted">누적 총 땀</span>
            <span className="text-sm font-semibold text-theme-primary">
              {(displayedSweatPoints / 100).toFixed(1)}
              <span className="text-xs font-normal text-theme-muted ml-0.5">L</span>
            </span>
          </div>

          {/* 클레임 이력 리스트 */}
          {!claimsData ? (
            <div className="py-6 text-center text-xs text-theme-muted">불러오는 중...</div>
          ) : claimsData.length === 0 ? (
            <div className="py-6 text-center text-xs text-theme-muted">클레임 이력이 없습니다</div>
          ) : (
            claimsData.map((claim) => (
              <div key={claim.id} className="flex items-center justify-between px-5 py-3 border-b border-theme-border last:border-0">
                <div>
                  <p className="text-xs font-medium text-theme-primary">{claim.week_label}</p>
                  <p className="text-xs text-theme-muted mt-0.5">
                    {(claim.points_used / 100).toFixed(2)} L
                  </p>
                </div>
                <span className={`text-xs font-semibold ${
                  claim.status === 'paid' ? 'text-green-400' :
                  claim.status === 'pending' ? 'text-yellow-400' :
                  claim.status === 'failed' ? 'text-red-400' :
                  'text-theme-muted'
                }`}>
                  {claim.status === 'paid' ? '지급완료' :
                   claim.status === 'pending' ? '대기' :
                   claim.status === 'failed' ? '실패' : '취소'}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── 스트릭 카드 ── */}
      <div className="mx-4 mb-4 rounded-xl bg-theme-surface px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-orange-400">
              <Flame size={22} strokeWidth={2} />
              <span className="text-3xl font-bold leading-none">{streak}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-theme-primary">일 연속</p>
              {streak === 0 && (
                <p className="text-xs text-theme-muted">오늘 첫 운동을 시작해보세요!</p>
              )}
            </div>
          </div>
          <div className="text-right">
            {streak >= 100 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400">
                <Award size={12} /> 100일 레전드
              </span>
            )}
            {streak >= 30 && streak < 100 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-400">
                <Award size={12} /> 한달 달성
              </span>
            )}
            {streak >= 14 && streak < 30 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-bold text-orange-400">
                <Award size={12} /> 2주 달성
              </span>
            )}
            {streak >= 7 && streak < 14 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2.5 py-1 text-xs font-bold text-orange-400">
                <Award size={12} /> 7일 달성
              </span>
            )}
            {streak >= 3 && streak < 7 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2.5 py-1 text-xs font-bold text-yellow-400">
                <Award size={12} /> 3일 달성
              </span>
            )}
          </div>
        </div>
        <div className="mt-3 h-px bg-theme-border" />
        <div className="mt-3 flex items-center justify-between">
          <p className="text-sm text-theme-muted">
            이번 달 <span className="font-semibold text-theme-primary">{totalWorkoutDays}일</span> 운동
          </p>
          <button
            onClick={() => {
              const text = `이번 달 ${totalWorkoutDays}일 운동, 연속 ${streak}일 달성`
              if (typeof navigator !== 'undefined' && 'share' in navigator) {
                navigator.share({ title: 'Stack Health 운동 리포트', text, url: window.location.origin }).catch(() => undefined)
              } else {
                window.navigator.clipboard?.writeText(text).then(() => alert('클립보드에 복사됐어요!')).catch(() => undefined)
              }
            }}
            className="flex items-center gap-1 rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent"
          >
            <Share2 size={12} />
            공유
          </button>
        </div>
      </div>

      {/* ── 캘린더 ── */}
      <div className="mx-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={prevMonth}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-theme-surface transition-colors"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-theme-primary" />
          </button>
          <span className="text-base font-semibold text-theme-primary">
            {year}년 {month}월
          </span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-theme-surface transition-colors disabled:opacity-30"
          >
            <ChevronRight size={20} strokeWidth={2} className="text-theme-primary" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAYS_KO.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-theme-muted py-1">{d}</div>
          ))}
        </div>

        {historyLoading ? (
          <div className="flex h-48 items-center justify-center text-theme-muted text-sm">
            불러오는 중...
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (cell.day === null) return <div key={`empty-${idx}`} className="aspect-square" />
              const posts = cell.dateStr ? (workoutDays[cell.dateStr] ?? []) : []
              const hasWorkout = posts.length > 0
              const isToday = cell.day === todayNum

              if (hasWorkout) {
                return (
                  <button
                    key={cell.dateStr}
                    onClick={() => openDay(cell.dateStr!, posts)}
                    className={`aspect-square relative overflow-hidden rounded-xl active:scale-95 transition-transform ${isToday ? 'ring-2 ring-accent ring-offset-1 ring-offset-[--bg-page]' : ''}`}
                  >
                    <video
                      src={posts[0].cdn_url}
                      className="absolute inset-0 h-full w-full object-cover"
                      muted playsInline preload="metadata"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                    <span className="absolute bottom-1 left-0 right-0 text-center text-[11px] font-bold text-white leading-none">
                      {cell.day}
                    </span>
                    {posts.length > 1 && (
                      <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />
                    )}
                  </button>
                )
              }

              return (
                <div
                  key={cell.dateStr}
                  className={`aspect-square flex items-center justify-center rounded-xl text-sm font-medium ${isToday ? 'ring-1 ring-accent text-accent' : 'text-theme-muted'}`}
                >
                  {cell.day}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 내 영상 목록 ── */}
      <div className="mx-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-theme-primary">내 영상</p>
          {myPostsData && myPostsData.length > 0 && (
            <span className="text-xs text-theme-muted">{myPostsData.length}개</span>
          )}
        </div>

        {myPostsLoading ? (
          <div className="flex h-24 items-center justify-center text-sm text-theme-muted">
            불러오는 중...
          </div>
        ) : !myPostsData || myPostsData.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-xl bg-theme-surface text-sm text-theme-muted">
            업로드한 영상이 없습니다
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {myPostsData.map((post) => (
              <div key={post.id} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-theme-surface2 group">
                <video
                  src={post.cdn_url}
                  className="absolute inset-0 h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white/80">
                  <Play size={10} strokeWidth={2} />
                  <span className="text-[10px]">{post.view_count}</span>
                </div>
                <button
                  onClick={() => setDeleteConfirmId(post.id)}
                  className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity active:opacity-100"
                  aria-label="삭제"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 삭제 확인 다이얼로그 ── */}
      {deleteConfirmId !== null && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-theme-surface px-6 pt-5 pb-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold text-theme-primary mb-1">영상 삭제</p>
            <p className="text-sm text-theme-muted mb-5">삭제하면 복구할 수 없습니다.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 rounded-xl bg-theme-surface2 py-3 text-sm text-theme-muted"
              >
                취소
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirmId)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 풀스크린 영상 뷰어 ── */}
      {selectedDate && selectedPosts.length > 0 && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gradient-to-b from-black/60 to-transparent">
            <button
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30"
            >
              <ArrowLeft size={20} strokeWidth={2} color="white" />
            </button>
            <span className="text-sm font-semibold text-white">
              {selectedDate.replace(/-/g, '.')}
            </span>
            {selectedPosts.length > 1 ? (
              <span className="text-xs text-white/70">{videoIdx + 1} / {selectedPosts.length}</span>
            ) : (
              <div className="w-9" />
            )}
          </div>

          <video
            key={selectedPosts[videoIdx].cdn_url}
            src={selectedPosts[videoIdx].cdn_url}
            className="h-full w-full object-contain"
            autoPlay playsInline controls
          />

          <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-16 bg-gradient-to-t from-black/70 to-transparent">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5 text-white/80">
                <Heart size={14} strokeWidth={1.5} />
                <span className="text-sm">{selectedPosts[videoIdx].like_count}</span>
              </div>
              <div className="flex items-center gap-1.5 text-white/80">
                <Eye size={14} strokeWidth={1.5} />
                <span className="text-sm">{selectedPosts[videoIdx].view_count}</span>
              </div>
            </div>
            {selectedPosts[videoIdx].caption && (
              <p className="text-sm text-white/90 line-clamp-2 mb-3">{selectedPosts[videoIdx].caption}</p>
            )}
            {selectedPosts.length > 1 && (
              <div className="flex gap-1.5">
                {selectedPosts.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setVideoIdx(i)}
                    className={`h-1 flex-1 rounded-full transition-all ${i === videoIdx ? 'bg-accent' : 'bg-white/30'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
