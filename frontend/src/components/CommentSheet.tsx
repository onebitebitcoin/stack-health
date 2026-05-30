import { useState, useRef, useEffect } from 'react'
import { X, Send, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import client from '../api/client'
import type { Comment, FeedResponse } from '../api/types'
import { useAuthStore } from '../store/auth'
import UserAvatar from './UserAvatar'

interface CommentSheetProps {
  postId: number
  open: boolean
  onClose: () => void
  onLoginRequired: () => void
}

export default function CommentSheet({ postId, open, onClose, onLoginRequired }: CommentSheetProps) {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [content, setContent] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  // iOS 키보드가 올라올 때 시트가 가려지는 문제 처리
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv || !open) return
    const sheet = sheetRef.current
    const reposition = () => {
      const offset = window.innerHeight - vv.offsetTop - vv.height
      if (sheet) {
        sheet.style.bottom = `${Math.max(0, offset)}px`
      }
    }
    vv.addEventListener('resize', reposition)
    vv.addEventListener('scroll', reposition)
    return () => {
      vv.removeEventListener('resize', reposition)
      vv.removeEventListener('scroll', reposition)
      if (sheet) {
        sheet.style.bottom = '0px'
      }
    }
  }, [open])

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const res = await client.get<{ data: { comments: Comment[] } }>(`/feed/${postId}/comments`)
      return res.data.data.comments
    },
    enabled: open,
  })

  function updateFeedCommentCount(delta: number) {
    qc.setQueriesData<InfiniteData<FeedResponse>>(
      { queryKey: ['feed'] },
      (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === postId ? { ...p, comment_count: p.comment_count + delta } : p
            ),
          })),
        }
      }
    )
    // Sync my-posts cache (profile page)
    qc.setQueryData(['my-posts'], (old: unknown) => {
      if (!old || typeof old !== 'object') return old
      const data = old as { posts: Array<{ id: number; comment_count: number }> }
      return { ...data, posts: data.posts.map((p) => p.id === postId ? { ...p, comment_count: p.comment_count + delta } : p) }
    })
  }

  const addComment = useMutation({
    mutationFn: async (text: string) => {
      await client.post(`/feed/${postId}/comments`, { content: text })
    },
    onSuccess: () => {
      setContent('')
      qc.invalidateQueries({ queryKey: ['comments', postId] }).catch(() => undefined)
      updateFeedCommentCount(1)
    },
  })

  const deleteComment = useMutation({
    mutationFn: async (commentId: number) => {
      await client.delete(`/feed/${postId}/comments/${commentId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] }).catch(() => undefined)
      updateFeedCommentCount(-1)
    },
  })

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token) {
      onLoginRequired()
      return
    }
    const text = content.trim()
    if (!text) return
    addComment.mutate(text)
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[55] lg:bg-black/50"
          onClick={onClose}
        />
      )}

      {/* Sheet — 모바일: 하단 슬라이드업 / 데스크탑: 중앙 모달 */}
      <div
        ref={sheetRef}
        data-testid="comment-sheet"
        className={[
          'fixed z-[60] flex flex-col bg-zinc-900/95 backdrop-blur duration-300',
          'bottom-0 left-0 right-0 rounded-t-2xl transition-transform',
          'lg:bottom-auto lg:right-auto lg:top-1/2 lg:left-1/2 lg:w-full lg:max-w-md lg:rounded-2xl',
          open
            ? 'translate-y-0 lg:-translate-x-1/2 lg:-translate-y-1/2'
            : 'translate-y-full lg:-translate-x-1/2 lg:opacity-0 lg:pointer-events-none',
        ].join(' ')}
        style={{ maxHeight: '70dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="font-semibold text-white">댓글 {comments.length}개</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {comments.length === 0 && (
            <p className="text-center text-zinc-500 py-8 text-sm">첫 댓글을 남겨보세요</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <UserAvatar
                username={c.username}
                avatarUrl={c.avatar_url}
                profileColor={c.profile_color}
                size={28}
                className="shrink-0 mt-0.5"
              />
              <div className="flex-1">
                <span className="text-xs font-semibold text-zinc-300">@{c.username}</span>
                <p className="text-sm text-white mt-0.5 break-words">{c.content}</p>
              </div>
              {user && user.id === c.user_id && (
                <button
                  onClick={() => deleteComment.mutate(c.id)}
                  className="text-zinc-600 hover:text-red-400 mt-1 shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3 border-t border-zinc-800">
          <input
            ref={inputRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={token ? '댓글 입력...' : '로그인 후 댓글을 작성하세요'}
            className="flex-1 rounded-full bg-zinc-800 px-4 py-2 text-sm text-white placeholder-zinc-500 outline-none"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={!content.trim() || addComment.isPending}
            className="rounded-full bg-accent p-2 text-accent-fg disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </>
  )
}
