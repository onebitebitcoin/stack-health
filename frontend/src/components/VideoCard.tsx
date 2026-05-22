import { useRef, useEffect, useState, useCallback } from 'react'
import { Heart, MessageCircle, Volume2, VolumeX, Pause, Play } from 'lucide-react'
import type { Post } from '../api/types'
import TagChip from './TagChip'
import PointBadge from './PointBadge'
import CommentSheet from './CommentSheet'
import client from '../api/client'
import { useAuthStore } from '../store/auth'

interface VideoCardProps {
  post: Post
  onLoginRequired: () => void
  isMuted: boolean
  onToggleMute: () => void
}

export default function VideoCard({ post, onLoginRequired, isMuted, onToggleMute }: VideoCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const token = useAuthStore((s) => s.token)
  const [liked, setLiked] = useState(post.is_liked ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [viewSent, setViewSent] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [flashIcon, setFlashIcon] = useState<'play' | 'pause' | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
          if (!viewSent && token) {
            setViewSent(true)
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
  }, [post.id, token, viewSent])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted
  }, [isMuted])

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

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  const handleLike = useCallback(async () => {
    if (!token) {
      onLoginRequired()
      return
    }
    try {
      const res = await client.post<{ data: { liked: boolean; like_count: number } }>(
        `/feed/${post.id}/like`,
      )
      setLiked(res.data.data.liked)
      setLikeCount(res.data.data.like_count)
    } catch {
      // ignore
    }
  }, [token, post.id, onLoginRequired])

  return (
    <div ref={containerRef} className="relative h-[100dvh] w-full flex-shrink-0 bg-black">
      <video
        ref={videoRef}
        src={post.cdn_url}
        className="h-full w-full object-cover"
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
      />

      {/* 탭으로 일시정지/재생 — 버튼 영역 제외한 전체 오버레이 */}
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
        className="absolute bottom-24 right-3 flex flex-col items-center gap-4"
        style={{ zIndex: 3 }}
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
          onClick={(e) => { e.stopPropagation(); setShowComments(true) }}
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle size={32} strokeWidth={1.5} className="text-white" />
          <span className="text-xs font-semibold text-white drop-shadow">{commentCount}</span>
        </button>

        <PointBadge points={2} />
      </div>

      {/* bottom overlay */}
      <div
        className="absolute bottom-16 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16"
        style={{ zIndex: 3 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-fg text-xs font-bold shrink-0">
            {post.username.charAt(0).toUpperCase()}
          </div>
          <p className="font-semibold text-white drop-shadow">@{post.username}</p>
        </div>
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
      </div>

      {/* CommentSheet */}
      <CommentSheet
        postId={post.id}
        open={showComments}
        onClose={() => setShowComments(false)}
        onLoginRequired={onLoginRequired}
      />
    </div>
  )
}
