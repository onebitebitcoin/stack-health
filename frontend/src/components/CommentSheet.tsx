import { useState, useRef, useEffect } from 'react'
import { X, Send, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'
import type { Comment } from '../api/types'
import { useAuthStore } from '../store/auth'

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

  const addComment = useMutation({
    mutationFn: async (text: string) => {
      await client.post(`/feed/${postId}/comments`, { content: text })
    },
    onSuccess: () => {
      setContent('')
      qc.invalidateQueries({ queryKey: ['comments', postId] }).catch(() => undefined)
    },
  })

  const deleteComment = useMutation({
    mutationFn: async (commentId: number) => {
      await client.delete(`/feed/${postId}/comments/${commentId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] }).catch(() => undefined)
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
          className="fixed inset-0 z-[55]"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        data-testid="comment-sheet"
        className={`fixed bottom-0 left-0 right-0 z-[60] flex flex-col rounded-t-2xl bg-zinc-900/95 backdrop-blur transition-transform duration-300 ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
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
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg text-xs font-bold">
                {c.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <span className="text-xs font-semibold text-zinc-300">@{c.username}</span>
                <p className="text-sm text-white mt-0.5 break-words">{c.content}</p>
              </div>
              {user && (user.id === c.user_id || user.is_admin) && (
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
