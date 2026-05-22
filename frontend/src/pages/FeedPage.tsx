import { useState, useRef, useCallback, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import client from '../api/client'
import type { FeedResponse } from '../api/types'
import VideoCard from '../components/VideoCard'
import LoginPromptSheet from '../components/LoginPromptSheet'
import LoadingScreen from '../components/LoadingScreen'
import LogoMark from '../components/LogoMark'

async function fetchFeed(cursor?: number): Promise<FeedResponse> {
  const params = cursor ? { cursor } : {}
  const res = await client.get<{ data: FeedResponse }>('/feed', { params })
  return res.data.data
}

export default function FeedPage() {
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
      if (delta > 0) goTo(activeIndex + 1)
      else goTo(activeIndex - 1)
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

  if (isLoading) return <LoadingScreen />

  if (posts.length === 0) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-theme-page px-6 pb-16 text-center">
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
    )
  }

  return (
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
  )
}
