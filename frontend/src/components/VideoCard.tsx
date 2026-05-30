import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, MessageCircle, Volume2, VolumeX, Pause, Play, Clock, Share2 } from 'lucide-react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Post, FeedResponse } from '../api/types'
import TagChip from './TagChip'
import client from '../api/client'
import { useAuthStore } from '../store/auth'

interface VideoCardProps {
  post: Post
  onLoginRequired: () => void
  onCommentClick: () => void
  isMuted: boolean
  onToggleMute: () => void
}

export default function VideoCard({ post, onLoginRequired, onCommentClick, isMuted, onToggleMute }: VideoCardProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [liked, setLiked] = useState(post.is_liked ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const viewSent = useRef(false)

  // Sync local state when feed data is refetched (SPA navigation stale cache fix)
  useEffect(() => { setLiked(post.is_liked ?? false) }, [post.is_liked])
  useEffect(() => { setLikeCount(post.like_count) }, [post.like_count])
  const [isPaused, setIsPaused] = useState(false)
  const [flashIcon, setFlashIcon] = useState<'play' | 'pause' | null>(null)
  const [progress, setProgress] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [isLandscape, setIsLandscape] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDragging = useRef(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const isLikePending = useRef(false)
  const commentCount = post.comment_count ?? 0

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current
        if (!video) return
        if (entry.isIntersecting) {
          setIsPaused(false)
          video.play().catch(() => undefined)
          if (!viewSent.current && token) {
            viewSent.current = true
            client.post(`/feed/${post.id}/view`).catch(() => undefined)
          }
        } else {
          video.pause()
          video.currentTime = 0
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [post.id, token])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted
  }, [isMuted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onTimeUpdate = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100)
    }
    const onMeta = () => {
      setIsLandscape(video.videoWidth > video.videoHeight)
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onMeta)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onMeta)
    }
  }, [])

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
  }, [])

  const seekToRatio = useCallback((clientX: number) => {
    const video = videoRef.current
    const bar = progressBarRef.current
    if (!video || !video.duration || !bar) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    video.currentTime = ratio * video.duration
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      seekToRatio(clientX)
    }
    const onEnd = () => {
      if (!isDragging.current) return
      isDragging.current = false
      setIsScrubbing(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchmove', onMove as EventListener, { passive: true })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchmove', onMove as EventListener)
      document.removeEventListener('touchend', onEnd)
    }
  }, [seekToRatio])

  const handleTap = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().catch(() => undefined)
      setIsPaused(false)
      setFlashIcon('play')
    } else {
      video.pause()
      setIsPaused(true)
      setFlashIcon('pause')
    }
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashIcon(null), 600)
  }, [])

  const handleLike = useCallback(async () => {
    if (!token) {
      onLoginRequired()
      return
    }
    if (isLikePending.current) return
    isLikePending.current = true
    try {
      const res = await client.post<{ data: { liked: boolean; like_count: number } }>(
        `/feed/${post.id}/like`,
      )
      const { liked: newLiked, like_count: newCount } = res.data.data
      setLiked(newLiked)
      setLikeCount(newCount)
      // Update feed cache so navigating away and back shows correct liked state
      queryClient.setQueryData<InfiniteData<FeedResponse>>(['feed'], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === post.id ? { ...p, is_liked: newLiked, like_count: newCount } : p
            ),
          })),
        }
      })
      // Sync my-posts cache (profile page)
      queryClient.setQueryData(['my-posts'], (old: unknown) => {
        if (!old || typeof old !== 'object') return old
        const data = old as { posts: Array<{ id: number; like_count: number }> }
        return { ...data, posts: data.posts.map((p) => p.id === post.id ? { ...p, like_count: newCount } : p) }
      })
    } catch {
      // ignore
    } finally {
      isLikePending.current = false
    }
  }, [token, post.id, onLoginRequired, queryClient])

  return (
    <div ref={containerRef} className="relative h-[100dvh] w-full flex-shrink-0 bg-black">
      <video
        ref={videoRef}
        src={post.cdn_url}
        className={`h-full w-full ${isLandscape ? 'object-contain' : 'object-cover'}`}
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
      />

      {/* 탭 오버레이 */}
      <div
        className="absolute inset-0"
        onClick={handleTap}
        style={{ zIndex: 1 }}
      />

      {/* 일시정지/재생 아이콘 플래시 */}
      {flashIcon && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 2 }}
        >
          <div className="rounded-full bg-black/50 p-4 animate-ping-once">
            {flashIcon === 'pause'
              ? <Pause size={40} className="text-white fill-white" />
              : <Play size={40} className="text-white fill-white" />
            }
          </div>
        </div>
      )}

      {/* 음소거 토글 — 우상단 */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleMute() }}
        className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm"
        style={{ zIndex: 3 }}
        aria-label={isMuted ? '소리 켜기' : '소리 끄기'}
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* 일시정지 중 표시 */}
      {isPaused && !flashIcon && (
        <div
          className="absolute top-4 left-4 rounded-full bg-black/40 p-1.5"
          style={{ zIndex: 3 }}
        >
          <Pause size={16} className="text-white fill-white" />
        </div>
      )}

      {/* right actions - 세로 버튼 스택 */}
      <div
        className="absolute right-3 flex flex-col items-center gap-4 bottom-nav-safe"
        style={{ zIndex: 4, paddingBottom: '1.5rem' }}
      >
        {/* 좋아요 */}
        <button
          onClick={(e) => { e.stopPropagation(); handleLike() }}
          className="flex flex-col items-center gap-1"
        >
          <Heart
            size={32}
            strokeWidth={1.5}
            className={liked ? 'fill-red-500 text-red-500' : 'text-white'}
          />
          <span className="text-xs font-semibold text-white drop-shadow">{likeCount}</span>
        </button>

        {/* 댓글 */}
        <button
          data-testid="comment-btn"
          onClick={(e) => { e.stopPropagation(); onCommentClick() }}
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle size={32} strokeWidth={1.5} className="text-white" />
          <span className="text-xs font-semibold text-white drop-shadow">{commentCount}</span>
        </button>

        {/* 공유 */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            const shareUrl = `${window.location.origin}/shorts/${post.share_token}`
            const shareTitle = 'Stack Health'
            const shareText = '나의 운동을 기록하자'
            if (typeof navigator !== 'undefined' && 'share' in navigator) {
              navigator.share({ title: shareTitle, text: shareText, url: shareUrl }).catch((err) => {
                if (err instanceof DOMException && err.name === 'AbortError') return
                window.navigator.clipboard?.writeText(shareUrl)
                  .then(() => alert('링크가 복사됐어요!'))
                  .catch(() => alert(`공유 링크: ${shareUrl}`))
              })
            } else {
              window.navigator.clipboard?.writeText(shareUrl)
                .then(() => alert('링크가 복사됐어요!'))
                .catch(() => alert(`공유 링크: ${shareUrl}`))
            }
          }}
          className="flex flex-col items-center gap-1"
        >
          <Share2 size={28} strokeWidth={1.5} className="text-white" />
          <span className="text-xs font-semibold text-white drop-shadow">공유</span>
        </button>
      </div>

      {/* 재생 진행 바 — 드래그로 위치 조정 가능 */}
      <div
        ref={progressBarRef}
        className={`absolute left-0 right-0 flex items-end cursor-pointer bottom-nav-safe touch-none ${isScrubbing ? 'h-12' : 'h-8'}`}
        style={{ zIndex: 5 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.stopPropagation(); isDragging.current = true; setIsScrubbing(true); seekToRatio(e.clientX) }}
        onTouchStart={(e) => { e.stopPropagation(); isDragging.current = true; setIsScrubbing(true); seekToRatio(e.touches[0].clientX) }}
      >
        <div className={`w-full bg-white/30 transition-all ${isScrubbing ? 'h-1.5' : 'h-0.5'}`}>
          <div
            className="h-full bg-white transition-none relative"
            style={{ width: `${progress}%` }}
          >
            {isScrubbing && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow" />
            )}
          </div>
        </div>
      </div>

      {/* bottom overlay */}
      <div
        className="absolute left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16 bottom-nav-safe"
        style={{ zIndex: 3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/users/${post.user_id}`) }}
          className="flex items-center gap-2 mb-1 active:opacity-70"
        >
          {post.avatar_url ? (
            <img
              src={post.avatar_url}
              alt={post.username}
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${post.profile_color ? 'text-white' : 'bg-accent text-accent-fg'}`}
              style={post.profile_color ? { backgroundColor: post.profile_color } : undefined}
            >
              {post.username.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="font-semibold text-white drop-shadow">@{post.username}</p>
        </button>
        {post.caption && (
          <p className="mt-1 text-sm text-zinc-200 line-clamp-2">{post.caption}</p>
        )}
        {post.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <TagChip key={tag} label={tag} />
            ))}
          </div>
        )}
        {post.workout_start && post.workout_end && (
          <p className="mt-1 text-xs text-white/80 flex items-center gap-1">
            <Clock size={12} />
            {post.workout_start} ~ {post.workout_end}
          </p>
        )}
      </div>

    </div>
  )
}
