import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Droplets, ShieldCheck, Settings,
  ChevronLeft, ChevronRight, ChevronDown, Flame, Heart, Eye, MessageCircle, ArrowLeft, Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import type { MyStats, HistoryResponse, HistoryWorkoutPost, WeeklyPointsHistory } from '../api/types'
import client from '../api/client'
import LoadingScreen from '../components/LoadingScreen'
import UserAvatar from '../components/UserAvatar'

import { getDaysInMonth, getFirstDayIndex, pad2 } from '../utils/calendar'

const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일']

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
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

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  const videoItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const pendingScrollIdx = useRef<number>(0)

  useEffect(() => {
    videoRefs.current = videoRefs.current.slice(0, selectedPosts.length)
    videoItemRefs.current = videoItemRefs.current.slice(0, selectedPosts.length)
    if (!selectedDate || selectedPosts.length === 0) return
    const container = scrollContainerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = videoItemRefs.current.indexOf(entry.target as HTMLDivElement)
          if (idx === -1) continue
          const video = videoRefs.current[idx]
          if (entry.isIntersecting) {
            setVideoIdx(idx)
            video?.play().catch(() => {})
          } else {
            video?.pause()
          }
        }
      },
      { root: container, threshold: 0.5 },
    )

    videoItemRefs.current.forEach((el) => { if (el) observer.observe(el) })

    const startIdx = pendingScrollIdx.current
    if (startIdx > 0) {
      pendingScrollIdx.current = 0
      requestAnimationFrame(() => {
        videoItemRefs.current[startIdx]?.scrollIntoView()
      })
    } else {
      videoRefs.current[0]?.play().catch(() => {})
    }

    return () => observer.disconnect()
  }, [selectedDate, selectedPosts])

  const { data: myStats, isLoading } = useQuery<MyStats>({
    queryKey: ['my-stats'],
    queryFn: async () => {
      const res = await client.get<{ data: MyStats }>('/users/me/stats')
      return res.data.data
    },
    enabled: !!user,
  })


  const { data: weeklyPointsData, isLoading: weeklyPointsLoading, isError: weeklyPointsError } = useQuery<WeeklyPointsHistory>({
    queryKey: ['my-weekly-points'],
    queryFn: async () => {
      const res = await client.get<{ data: WeeklyPointsHistory }>('/users/me/weekly-points')
      return res.data.data
    },
    enabled: !!user && showWeeklyHistory,
    refetchInterval: 60_000,
  })

  type MyPost = { id: number; cdn_url: string; caption: string | null; created_at: string; like_count: number; view_count: number; comment_count: number }
  type MyPostsPage = { posts: MyPost[]; has_more: boolean; week_offset: number }

  const {
    data: myPostsData,
    isLoading: myPostsLoading,
  } = useQuery<MyPostsPage>({
    queryKey: ['my-posts'],
    queryFn: async () => {
      const res = await client.get<{ data: MyPostsPage }>('/videos/my-posts', {
        params: { all: true },
      })
      return res.data.data
    },
    enabled: !!user,
  })

  const myPosts = myPostsData?.posts ?? []

  const deleteMutation = useMutation({
    mutationFn: (postId: number) => client.delete(`/videos/posts/${postId}`),
    onSuccess: (_, postId) => {
      queryClient.setQueryData<MyPostsPage>(
        ['my-posts'],
        (old) => old ? { ...old, posts: old.posts.filter((p) => p.id !== postId) } : old
      )
      queryClient.invalidateQueries({ queryKey: ['history'] })
      queryClient.invalidateQueries({ queryKey: ['my-stats'] })
      setDeleteConfirmId(null)
    },
  })

  const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: historyData, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ['history', year, month, clientTimezone],
    queryFn: async () => {
      const res = await client.get('/history', { params: { year, month, timezone: clientTimezone } })
      return res.data.data
    },
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

  function openMyPosts(startIdx: number) {
    pendingScrollIdx.current = startIdx
    setSelectedDate('__my_posts__')
    setSelectedPosts(myPosts as HistoryWorkoutPost[])
    setVideoIdx(startIdx)
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
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <UserAvatar
          username={user?.username ?? '?'}
          avatarUrl={user?.avatar_url}
          profileColor={user?.app_settings?.profile_color as string | null}
          size={36}
        />

        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-theme-primary truncate">{user?.username}</span>
          {user?.is_admin && (
            <span className="flex-shrink-0 flex items-center gap-0.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              <ShieldCheck size={9} />관리자
            </span>
          )}
        </div>
        <button
          onClick={() => navigate('/settings')}
          className="flex-shrink-0 p-1.5 text-theme-muted hover:text-theme-primary transition-colors"
        >
          <Settings size={16} strokeWidth={1.5} />
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
        onClick={() => { setShowWeeklyHistory((v) => !v) }}
        className={`mx-4 flex flex-col items-center gap-2 w-[calc(100%-2rem)] bg-theme-surface px-6 py-6 active:scale-[0.98] transition-transform ${showWeeklyHistory ? 'rounded-t-2xl mb-0' : 'rounded-2xl mb-4'}`}
      >
        <span className="text-xs text-theme-muted">이번 주 흘린 땀</span>
        <Droplets size={30} className="text-blue-400" strokeWidth={1.5} />
        <span className="text-5xl font-bold font-mono text-theme-primary">
          {weekPoints.toFixed(2)}
          <span className="text-xl font-medium text-theme-muted ml-1">L</span>
        </span>
        {weekQueuedPoints > 0 && (
          <div className="flex items-center gap-1.5 rounded-full bg-theme-surface2 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs text-theme-muted">+{weekQueuedPoints.toFixed(2)}L 대기 중</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-theme-muted mt-1">
          <span>주간 이력</span>
          <ChevronDown size={13} className={`transition-transform ${showWeeklyHistory ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* ── 주간 이력 collapse ── */}
      {showWeeklyHistory && (
        <div className="mx-4 mb-4 rounded-b-2xl bg-theme-surface overflow-hidden border-t border-theme-border flex-shrink-0">
          {/* 누적 합계 */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-theme-border">
            <span className="text-xs font-medium text-theme-muted">누적 총 땀</span>
            <span className="text-sm font-semibold text-theme-primary">
              {displayedSweatPoints.toFixed(1)}
              <span className="text-xs font-normal text-theme-muted ml-0.5">L</span>
            </span>
          </div>

          {/* 이번 주 활동 */}
          <div className="border-b border-theme-border">
            <div className="w-full flex items-center justify-between px-5 py-3 border-b border-theme-border">
              <span className="text-xs font-medium text-theme-muted">이번 주 활동</span>
              {weeklyPointsData && (
                <span className="text-xs text-theme-subtle">
                  {weeklyPointsData.week_number}주차{' '}
                  {weeklyPointsData.start_date.slice(5).replace('-', '/')}~{weeklyPointsData.end_date.slice(5).replace('-', '/')}
                </span>
              )}
            </div>
            {(weeklyPointsLoading ? (
              <div className="py-4 text-center text-xs text-theme-muted">불러오는 중...</div>
            ) : weeklyPointsError ? (
              <div className="py-4 text-center text-xs text-red-400">불러오기 실패</div>
            ) : !weeklyPointsData || weeklyPointsData.items.length === 0 ? (
              <div className="py-4 text-center text-xs text-theme-muted">이번 주 활동 없음</div>
            ) : (() => {
              const pending = weeklyPointsData.items.filter(i => i.queued)
              const fixed = weeklyPointsData.items.filter(i => !i.queued)

              function sourceLabel(s: string) {
                return s === 'upload' ? '영상 업로드' : s === 'comment' ? '댓글' : s === 'bonus' ? '보너스' : s
              }

              function hrsLeft(settlesAt: string) {
                return Math.max(0, Math.ceil((new Date(settlesAt).getTime() - Date.now()) / (60 * 60 * 1000)))
              }

              return (
                <div className="max-h-48 overflow-y-auto">
                  {pending.length > 0 && (
                    <>
                      <div className="px-5 pt-3 pb-1">
                        <span className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide">대기 중</span>
                      </div>
                      {pending.map((item, idx) => {
                        const hrs = hrsLeft(item.settles_at!)
                        return (
                          <div key={`p-${idx}`} className="flex items-center justify-between px-5 py-2.5 border-b border-theme-border last:border-0">
                            <div>
                              <p className="text-xs font-medium text-theme-primary">{sourceLabel(item.source)}</p>
                              <p className="text-[10px] text-yellow-400 mt-0.5">
                                {hrs > 0 ? `${hrs}시간 후 확정` : '곧 확정'}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-yellow-400">+{item.points.toFixed(2)} L</span>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {fixed.length > 0 && (
                    <>
                      <div className="px-5 pt-3 pb-1">
                        <span className="text-[10px] font-semibold text-accent uppercase tracking-wide">확정</span>
                      </div>
                      {fixed.map((item, idx) => (
                        <div key={`f-${idx}`} className="flex items-center justify-between px-5 py-2.5 border-b border-theme-border last:border-0">
                          <div>
                            <p className="text-xs font-medium text-theme-primary">{sourceLabel(item.source)}</p>
                            <p className="text-xs text-theme-muted">{item.date.slice(5).replace('-', '/')}</p>
                          </div>
                          <span className="text-xs font-semibold text-accent">+{item.points.toFixed(2)} L</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            })())}
          </div>


          {/* 접기 버튼 */}
          <button
            onClick={() => setShowWeeklyHistory(false)}
            className="w-full flex items-center justify-center gap-1 py-3 text-xs text-theme-muted active:opacity-60"
          >
            <ChevronDown size={13} className="rotate-180" />
            접기
          </button>
        </div>
      )}

      {/* ── 스트릭 카드 ── */}
      <div className="mx-4 mb-4 rounded-xl bg-theme-surface px-4 py-3">
        <div className="flex items-center gap-4 py-1">
          <div className="flex items-center gap-1.5 text-orange-400">
            <Flame size={20} strokeWidth={2} />
            <span className="text-2xl font-bold leading-none">{streak}</span>
            <span className="text-sm font-medium text-theme-primary">일 연속</span>
          </div>
          <div className="h-4 w-px bg-theme-border" />
          <div className="text-sm text-theme-muted">
            이번 달 <span className="font-semibold text-theme-primary">{totalWorkoutDays}일</span> 운동
          </div>
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
                    {posts[0].thumbnail_url ? (
                      <img
                        src={posts[0].thumbnail_url}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                      />
                    ) : (
                      <video
                        src={posts[0].cdn_url}
                        className="absolute inset-0 h-full w-full object-cover"
                        muted playsInline preload="metadata"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/30" />
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center pb-1.5 text-[11px] font-bold text-white leading-none">
                      {cell.day}
                    </span>
                    {posts.length > 1 && (
                      <div className="absolute top-1 right-1 min-w-[14px] h-3.5 rounded-full bg-accent flex items-center justify-center px-0.5">
                        <span className="text-[8px] font-bold text-accent-fg leading-none">{posts.length}</span>
                      </div>
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
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 px-4">
          <p className="text-sm font-semibold text-theme-primary">내 영상</p>
          {myPosts.length > 0 && (
            <span className="text-xs text-theme-muted">{myPosts.length}개</span>
          )}
        </div>

        {myPostsLoading ? (
          <div className="flex h-24 items-center justify-center text-sm text-theme-muted">
            불러오는 중...
          </div>
        ) : myPosts.length === 0 ? (
          <div className="mx-4 flex h-24 items-center justify-center rounded-xl bg-theme-surface text-sm text-theme-muted">
            업로드한 영상이 없습니다
          </div>
        ) : (
          <div
            className="flex gap-2 overflow-x-auto px-4 pb-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {myPosts.map((post, idx) => (
              <div
                key={post.id}
                className="relative flex-shrink-0 overflow-hidden rounded-xl bg-theme-surface2 group cursor-pointer active:scale-95 transition-transform"
                style={{ width: '28vw', aspectRatio: '9/16' }}
                onClick={() => openMyPosts(idx)}
              >
                <video
                  src={post.cdn_url}
                  className="absolute inset-0 h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute bottom-1.5 left-1 right-1 flex items-center justify-between text-white/90">
                  <div className="flex items-center gap-1">
                    <Heart size={9} strokeWidth={2} />
                    <span className="text-[9px] font-medium">{post.like_count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle size={9} strokeWidth={2} />
                    <span className="text-[9px] font-medium">{post.comment_count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye size={9} strokeWidth={2} />
                    <span className="text-[9px] font-medium">{post.view_count}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(post.id) }}
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
        <div className="fixed inset-0 z-[70] bg-black">
          {/* 헤더 오버레이 */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
            <button
              onClick={closeModal}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 pointer-events-auto"
            >
              <ArrowLeft size={20} strokeWidth={2} color="white" />
            </button>
            <span className="text-sm font-semibold text-white">
              {selectedDate === '__my_posts__' ? '내 영상' : selectedDate.replace(/-/g, '.')}
            </span>
            {selectedPosts.length > 1 ? (
              <span className="text-xs text-white/70">{videoIdx + 1} / {selectedPosts.length}</span>
            ) : (
              <div className="w-9" />
            )}
          </div>

          {/* 세로 스크롤 스냅 */}
          <div
            ref={scrollContainerRef}
            className="h-full w-full overflow-y-scroll"
            style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
          >
            {selectedPosts.map((post, i) => (
              <div
                key={post.cdn_url}
                ref={(el) => { videoItemRefs.current[i] = el }}
                className="relative h-full w-full flex-shrink-0"
                style={{ scrollSnapAlign: 'start' }}
              >
                <video
                  ref={(el) => { videoRefs.current[i] = el }}
                  src={post.cdn_url}
                  className="h-full w-full object-contain"
                  playsInline
                  loop
                />
                <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-6 pt-16 bg-gradient-to-t from-black/70 to-transparent">
                  <div className="flex items-center gap-4 mb-2">
                    <div className="flex items-center gap-1.5 text-white/80">
                      <Heart size={14} strokeWidth={1.5} />
                      <span className="text-sm">{post.like_count}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-white/80">
                      <Eye size={14} strokeWidth={1.5} />
                      <span className="text-sm">{post.view_count}</span>
                    </div>
                  </div>
                  {post.caption && (
                    <p className="text-sm text-white/90 line-clamp-2">{post.caption}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
