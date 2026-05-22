import { useRef, useEffect, useState, useCallback } from 'react'
import { Heart, MessageCircle, Volume2, VolumeX } from 'lucide-react'
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
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [viewSent, setViewSent] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const commentCount = post.comment_count ?? 0

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = videoRef.current
        if (!video) return
        if (entry.isIntersecting) {
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

  // isMuted prop이 바뀌면 video 엘리먼트에 즉시 반영
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted
  }, [isMuted])

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

      {/* 음소거 토글 — 우상단 */}
      <button
        onClick={onToggleMute}
        className="absolute top-4 right-4 rounded-full bg-black/40 p-2 text-white backdrop-blur-sm"
        aria-label={isMuted ? '소리 켜기' : '소리 끄기'}
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>

      {/* right actions - 세로 버튼 스택 */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-4">
        {/* 좋아요 */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <Heart
            size={32}
            strokeWidth={1.5}
            className={liked ? 'fill-red-500 text-red-500' : 'text-white'}
          />
          <span className="text-xs font-semibold text-white drop-shadow">{likeCount}</span>
        </button>

        {/* 댓글 */}
        <button onClick={() => setShowComments(true)} className="flex flex-col items-center gap-1">
          <MessageCircle size={32} strokeWidth={1.5} className="text-white" />
          <span className="text-xs font-semibold text-white drop-shadow">{commentCount}</span>
        </button>

        <PointBadge points={2} />
      </div>

      {/* bottom overlay */}
      <div className="absolute bottom-16 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-16">
        <p className="font-semibold text-white drop-shadow">@{post.username}</p>
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
