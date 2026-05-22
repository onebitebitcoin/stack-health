import { useState, useRef, useCallback, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import client from '../api/client'
import type { FeedResponse } from '../api/types'
import VideoCard from '../components/VideoCard'
import LoginPromptSheet from '../components/LoginPromptSheet'
import LoadingScreen from '../components/LoadingScreen'
import LogoMark from '../components/LogoMark'
import LeaderboardView from '../components/LeaderboardView'

async function fetchFeed(cursor?: number): Promise<FeedResponse> {
  const params = cursor ? { cursor } : {}
  const res = await client.get<{ data: FeedResponse }>('/feed', { params })
  return res.data.data
}

type Tab = 'feed' | 'leaderboard'

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>('feed')
  const [activeIndex, setActiveIndex] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)

  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) => fetchFeed(pageParam as number | undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const posts = data?.pages.flatMap((p) => p.posts) ?? []

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= posts.length) return
      setActiveIndex(idx)
      containerRef.current?.children[idx]?.scrollIntoView({ behavior: 'smooth' })
      if (idx >= posts.length - 2 && hasNextPage) {
        fetchNextPage().catch(() => undefined)
      }
    },
    [posts.length, hasNextPage, fetchNextPage],
  )

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = touchStartY.current - e.changedTouches[0].clientY
      if (Math.abs(delta) < 50) return
      if (delta > 0) {
        goTo(activeIndex + 1)
      } else {
        goTo(activeIndex - 1)
      }
    },
    [activeIndex, goTo],
  )

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.deltaY > 30) goTo(activeIndex + 1)
      else if (e.deltaY < -30) goTo(activeIndex - 1)
    }
    const el = containerRef.current
    el?.addEventListener('wheel', handleWheel, { passive: false })
    return () => el?.removeEventListener('wheel', handleWheel)
  }, [activeIndex, goTo])

  if (isLoading && tab === 'feed') return <LoadingScreen />

  return (
    <div className="h-[100dvh] flex flex-col bg-theme-page">
      {/* Top Segmented Control overlay */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 bg-black/40 backdrop-blur-sm rounded-full px-1 py-1">
        {(['feed', 'leaderboard'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1 text-sm font-medium rounded-full transition-colors ${
              tab === t ? 'bg-white text-black' : 'text-white/80'
            }`}
          >
            {t === 'feed' ? '피드' : '리더보드'}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' ? (
        <div className="flex-1 overflow-hidden pt-12 bg-theme-page">
          <LeaderboardView />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-theme-surface text-accent">
            <LogoMark aria-hidden="true" size={42} />
          </div>
          <div>
            <p className="font-semibold text-theme-primary">아직 업로드된 영상이 없어요</p>
            <p className="mt-1 text-sm text-theme-muted">
              15초 운동을 공유하고 커뮤니티 스코어를 쌓아보세요.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="h-[100dvh] overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {posts.map((post) => (
              <VideoCard
                key={post.id}
                post={post}
                onLoginRequired={() => setShowLogin(true)}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted((m) => !m)}
              />
            ))}
          </div>
          {showLogin && <LoginPromptSheet onClose={() => setShowLogin(false)} />}
        </>
      )}
    </div>
  )
}
