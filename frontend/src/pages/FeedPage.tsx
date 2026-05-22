import { useState, useRef, useCallback, useEffect } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import client from '../api/client'
import type { FeedResponse } from '../api/types'
import VideoCard from '../components/VideoCard'
import LoginPromptSheet from '../components/LoginPromptSheet'
import LoadingScreen from '../components/LoadingScreen'

async function fetchFeed(cursor?: number): Promise<FeedResponse> {
  const params = cursor ? { cursor } : {}
  const res = await client.get<{ data: FeedResponse }>('/feed', { params })
  return res.data.data
}

export default function FeedPage() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
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

  if (isLoading) return <LoadingScreen />

  if (posts.length === 0) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <p className="text-theme-muted">아직 업로드된 영상이 없어요</p>
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
          />
        ))}
      </div>
      {showLogin && <LoginPromptSheet onClose={() => setShowLogin(false)} />}
    </>
  )
}
