import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Heart, Eye, Dumbbell } from 'lucide-react'
import client from '../api/client'
import type { Post } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'
import { useAuthStore } from '../store/auth'

export default function SharedVideoPage() {
  const { postId } = useParams<{ postId: string }>()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)

  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ['shared-post', postId],
    queryFn: async () => {
      const res = await client.get<{ data: { post: Post } }>(`/videos/posts/${postId}`)
      return res.data.data.post
    },
    enabled: !!postId,
  })

  if (isLoading) return <LoadingScreen />

  if (!post) return (
    <div className="flex h-[100dvh] items-center justify-center bg-theme-page">
      <p className="text-theme-muted">영상을 찾을 수 없습니다</p>
    </div>
  )

  return (
    <div className="flex flex-col h-[100dvh] bg-black">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-safe pt-4 pb-3 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={() => navigate('/')} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30">
          <ArrowLeft size={20} color="white" />
        </button>
        <div className="flex items-center gap-2">
          <Dumbbell size={16} color="white" />
          <span className="text-sm font-semibold text-white">Stack Health</span>
        </div>
        <div className="w-9" />
      </div>

      <video
        src={post.cdn_url}
        className="h-full w-full object-contain"
        autoPlay playsInline controls
      />

      <div className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-8 pt-16 bg-gradient-to-t from-black/70 to-transparent">
        <p className="text-white font-semibold mb-1">@{post.username}</p>
        {post.caption && <p className="text-white/80 text-sm mb-3">{post.caption}</p>}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 text-white/80">
            <Heart size={14} /><span className="text-sm">{post.like_count}</span>
          </div>
          <div className="flex items-center gap-1.5 text-white/80">
            <Eye size={14} /><span className="text-sm">{post.view_count}</span>
          </div>
        </div>
        {!token && (
          <button
            onClick={() => navigate('/login')}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-accent-fg"
          >
            로그인하고 더 보기
          </button>
        )}
      </div>
    </div>
  )
}
