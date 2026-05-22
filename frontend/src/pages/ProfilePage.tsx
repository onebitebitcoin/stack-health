import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LogOut, Zap, Edit2, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { useAuthStore } from '../store/auth'
import type { Post } from '../api/types'

interface ProfileData {
  posts: Post[]
  total_points: number
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const setUser = useAuthStore((s) => s.setUser)
  const [editingLn, setEditingLn] = useState(false)
  const [lnInput, setLnInput] = useState(user?.lightning_address ?? '')
  const [saving, setSaving] = useState(false)

  const { data } = useQuery<ProfileData>({
    queryKey: ['profile'],
    queryFn: async () => {
      const [postsRes, summaryRes] = await Promise.all([
        client.get<{ data: { posts: Post[]; next_cursor: number | null } }>('/feed', {
          params: { limit: 20 },
        }),
        client.get<{ data: { current_week_points: number } }>('/rewards/summary'),
      ])
      return {
        posts: postsRes.data.data.posts.filter((p) => p.user_id === user?.id),
        total_points: summaryRes.data.data.current_week_points,
      }
    },
    enabled: !!user,
  })

  async function saveLightningAddress(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await client.patch<{ data: typeof user }>('/auth/me', {
        lightning_address: lnInput,
      })
      if (res.data.data) setUser(res.data.data)
      setEditingLn(false)
    } finally {
      setSaving(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-24 pt-6 h-[100dvh]">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-700 text-2xl font-bold text-white">
          {user?.username?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <p className="font-bold">{user?.username}</p>
          <p className="text-sm text-zinc-400">{user?.email}</p>
        </div>
      </div>

      {data && (
        <div className="flex gap-4">
          <div className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-center">
            <p className="text-2xl font-bold">{data.posts.length}</p>
            <p className="text-xs text-zinc-400">업로드</p>
          </div>
          <div className="flex-1 rounded-xl bg-zinc-900 px-4 py-3 text-center">
            <p className="text-2xl font-bold text-bitcoin">{data.total_points}</p>
            <p className="text-xs text-zinc-400">이번 주 pt</p>
          </div>
        </div>
      )}

      {/* video grid */}
      {data && data.posts.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {data.posts.map((post) => (
            <div key={post.id} className="aspect-[9/16] overflow-hidden rounded-lg bg-zinc-900">
              <video
                src={post.cdn_url}
                className="h-full w-full object-cover"
                muted
                playsInline
                preload="metadata"
              />
            </div>
          ))}
        </div>
      )}

      {/* settings */}
      <div className="rounded-2xl bg-zinc-900 p-4 space-y-3">
        <p className="font-semibold text-zinc-300">설정</p>

        <div className="space-y-1">
          <p className="text-sm text-zinc-400">Lightning Address</p>
          {editingLn ? (
            <form onSubmit={saveLightningAddress} className="flex gap-2">
              <input
                type="text"
                value={lnInput}
                onChange={(e) => setLnInput(e.target.value)}
                placeholder="you@wallet.com"
                className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-bitcoin"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-bitcoin px-3 py-2 text-black"
              >
                <Check size={16} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-bitcoin flex-shrink-0" />
              <span className="flex-1 text-sm text-white truncate">
                {user?.lightning_address ?? '미설정'}
              </span>
              <button onClick={() => setEditingLn(true)}>
                <Edit2 size={14} className="text-zinc-400" />
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm text-red-400 transition-colors hover:bg-zinc-700"
        >
          <LogOut size={16} />
          로그아웃
        </button>
      </div>
    </div>
  )
}
