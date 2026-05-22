import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Flame, Heart, Eye, ArrowLeft } from 'lucide-react'
import client from '../api/client'
import type { HistoryResponse, HistoryWorkoutPost } from '../api/types'

const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

// Returns weekday index 0=Mon...6=Sun for the 1st of the month
function getFirstDayIndex(year: number, month: number): number {
  const day = new Date(year, month - 1, 1).getDay() // 0=Sun...6=Sat
  return day === 0 ? 6 : day - 1
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

export default function HistoryPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedPosts, setSelectedPosts] = useState<HistoryWorkoutPost[]>([])
  const [videoIdx, setVideoIdx] = useState(0)

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ['history', year, month],
    queryFn: async () => {
      const res = await client.get('/history', { params: { year, month } })
      return res.data.data
    },
    staleTime: 60_000,
  })

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
    setSelectedDate(null)
  }

  function nextMonth() {
    const todayYear = now.getFullYear()
    const todayMonth = now.getMonth() + 1
    if (year > todayYear || (year === todayYear && month >= todayMonth)) return
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
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
  const workoutDays = data?.workout_days ?? {}
  const streak = data?.streak ?? 0
  const totalWorkoutDays = data?.total_days ?? 0

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1
  const todayNum = isCurrentMonth ? now.getDate() : -1

  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstIdx; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, dateStr: `${year}-${pad2(month)}-${pad2(d)}` })
  }
  // Fill trailing cells to complete last row
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null })

  return (
    <div className="flex flex-col h-[100dvh] bg-theme-page overflow-y-auto pb-20">
      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-bold text-theme-primary">운동 기록</h1>
      </div>

      {/* Streak + stats bar */}
      <div className="mx-4 mb-4 flex items-center gap-3 rounded-xl bg-theme-surface px-4 py-3">
        <div className="flex items-center gap-1.5 text-orange-400">
          <Flame size={20} strokeWidth={2} />
          <span className="text-lg font-bold">{streak}</span>
          <span className="text-sm font-medium">일 연속</span>
        </div>
        <div className="h-4 w-px bg-theme-border" />
        <div className="text-sm text-theme-muted">
          이번 달 <span className="font-semibold text-theme-primary">{totalWorkoutDays}</span>일 운동
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 mb-3">
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

      {/* Calendar grid */}
      <div className="px-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_KO.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-theme-muted py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-theme-muted text-sm">
            불러오는 중...
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, idx) => {
              if (cell.day === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />
              }
              const hasWorkout = cell.dateStr !== null && workoutDays[cell.dateStr]?.length > 0
              const isToday = cell.day === todayNum
              const posts = cell.dateStr ? (workoutDays[cell.dateStr] ?? []) : []

              if (hasWorkout) {
                return (
                  <button
                    key={cell.dateStr}
                    onClick={() => openDay(cell.dateStr!, posts)}
                    className={`
                      aspect-square relative overflow-hidden rounded-xl
                      active:scale-95 transition-transform
                      ${isToday ? 'ring-2 ring-accent ring-offset-1 ring-offset-[--bg-page]' : ''}
                    `}
                  >
                    <video
                      src={posts[0].cdn_url}
                      className="absolute inset-0 h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                    {/* 날짜 오버레이 */}
                    <div className="absolute inset-0 bg-black/30" />
                    <span className="absolute bottom-1 left-0 right-0 text-center text-[11px] font-bold text-white leading-none">
                      {cell.day}
                    </span>
                    {/* 복수 영상 인디케이터 */}
                    {posts.length > 1 && (
                      <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />
                    )}
                  </button>
                )
              }

              return (
                <div
                  key={cell.dateStr}
                  className={`
                    aspect-square flex items-center justify-center rounded-xl
                    text-sm font-medium
                    ${isToday ? 'ring-1 ring-accent text-accent' : 'text-theme-muted'}
                  `}
                >
                  {cell.day}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 풀스크린 영상 뷰어 */}
      {selectedDate && selectedPosts.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">

          {/* 상단 바 */}
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
              <span className="text-xs text-white/70">
                {videoIdx + 1} / {selectedPosts.length}
              </span>
            ) : (
              <div className="w-9" />
            )}
          </div>

          {/* 영상 (풀스크린 9:16) */}
          <video
            key={selectedPosts[videoIdx].cdn_url}
            src={selectedPosts[videoIdx].cdn_url}
            className="h-full w-full object-contain"
            autoPlay
            playsInline
            controls
          />

          {/* 하단 오버레이 */}
          <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-safe pb-6 pt-16 bg-gradient-to-t from-black/70 to-transparent">
            {/* stats */}
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
            {/* caption */}
            {selectedPosts[videoIdx].caption && (
              <p className="text-sm text-white/90 line-clamp-2 mb-3">
                {selectedPosts[videoIdx].caption}
              </p>
            )}
            {/* 복수 영상 도트 */}
            {selectedPosts.length > 1 && (
              <div className="flex gap-1.5">
                {selectedPosts.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setVideoIdx(i)}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i === videoIdx ? 'bg-accent' : 'bg-white/30'
                    }`}
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
