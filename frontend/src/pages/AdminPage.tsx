import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, User, Video, ChevronRight, Search, X, ArrowLeft, RefreshCw } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import client from '../api/client'
import type { AdminVideo, AdminUsersResponse } from '../api/types'
import { useAuthStore } from '../store/auth'

type TabId = 'users' | 'videos'

interface AdminVideosResponse {
  videos: AdminVideo[]
  total: number
  page: number
  limit: number
}

interface AdminUserDetail {
  user: {
    id: number
    email: string | null
    username: string
    lightning_address: string | null
    is_banned: boolean
    is_admin: boolean
    created_at: string
  }
  videos: { id: number; cdn_url: string; status: string; created_at: string }[]
  challenges: {
    challenge_id: number
    title: string
    upload_count: number
    condition_value: number
    completed: boolean
    joined_at: string
  }[]
  total_points: number
}

function UserDetailPanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery<AdminUserDetail>({
    queryKey: ['admin-user-detail', userId],
    queryFn: async () => {
      const res = await client.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`)
      return res.data.data
    },
  })

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80dvh] overflow-y-auto rounded-2xl bg-theme-page p-4 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && <p className="text-center text-theme-muted py-8">불러오는 중...</p>}
        {data && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-theme-primary text-lg">@{data.user.username}</p>
                <p className="text-xs text-theme-muted">{data.user.email ?? '이메일 없음'}</p>
              </div>
              <button onClick={onClose} className="text-theme-muted text-sm px-2 py-1">닫기</button>
            </div>

            <div className="flex justify-between text-xs rounded-lg bg-theme-surface px-3 py-2">
              <span className="text-theme-muted">누적 포인트</span>
              <span className="font-semibold text-theme-primary">{Number(data.total_points).toFixed(2)}P</span>
            </div>

            {data.challenges.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-theme-muted mb-2">챌린지 ({data.challenges.length})</p>
                <div className="space-y-1">
                  {data.challenges.map((c) => (
                    <div key={c.challenge_id} className="flex items-center justify-between text-xs rounded-lg bg-theme-surface px-3 py-2">
                      <span className="text-theme-primary flex-1 min-w-0 truncate">{c.title}</span>
                      <span className="ml-2 text-theme-muted shrink-0">
                        {c.upload_count}/{c.condition_value}{c.completed ? ' ✓' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-theme-muted">총 업로드: {data.videos.length}개</p>
          </>
        )}
      </div>
    </div>
  )
}

export default function AdminPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: TabId = (searchParams.get('tab') as TabId) ?? 'users'
  const [videoPage, setVideoPage] = useState(1)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [deleteVideoConfirmId, setDeleteVideoConfirmId] = useState<number | null>(null)
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<{ id: number; username: string } | null>(null)
  const [userPage, setUserPage] = useState(1)
  const [userSearchInput, setUserSearchInput] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const isAdmin = user?.is_admin ?? false

  useEffect(() => {
    const t = setTimeout(() => {
      setUserSearch(userSearchInput)
      setUserPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [userSearchInput])

  const { data: usersData, isLoading: usersLoading, isError: usersError, refetch: refetchUsers, isFetching: usersFetching } = useQuery<AdminUsersResponse>({
    queryKey: ['admin-users', userPage, userSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(userPage), limit: '20' })
      if (userSearch) params.set('search', userSearch)
      const res = await client.get<{ data: AdminUsersResponse }>(`/admin/users?${params}`)
      return res.data.data
    },
    enabled: isAdmin && activeTab === 'users',
  })
  const users = usersData?.users ?? []

  const deleteUser = useMutation({
    mutationFn: (id: number) => client.delete(`/admin/users/${id}`),
    onSuccess: (_, id) => {
      qc.setQueryData<AdminUsersResponse>(['admin-users', userPage, userSearch], (old) =>
        old ? { ...old, users: old.users.filter((u) => u.id !== id) } : old
      )
    },
  })

  const { data: videosData, isLoading: videosLoading, isError: videosError } = useQuery<AdminVideosResponse>({
    queryKey: ['admin-videos', videoPage],
    queryFn: async () => {
      const res = await client.get<{ data: AdminVideosResponse }>('/admin/videos', {
        params: { page: videoPage, limit: 20 },
      })
      return res.data.data
    },
    enabled: isAdmin && activeTab === 'videos',
  })
  const videos = videosData?.videos ?? []
  const videoTotal = videosData?.total ?? 0
  const videoTotalPages = Math.ceil(videoTotal / 20)

  const deleteVideo = useMutation({
    mutationFn: (id: number) => client.delete(`/admin/videos/${id}`),
    onSuccess: (_, id) => {
      qc.setQueryData<AdminVideosResponse>(['admin-videos', videoPage], (old) =>
        old ? { ...old, videos: old.videos.filter((v) => v.id !== id), total: old.total - 1 } : old
      )
    },
  })

  if (!isAdmin) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-theme-page">
        <p className="text-theme-muted text-sm">관리자만 접근할 수 있습니다</p>
      </div>
    )
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: '유저', icon: <User size={14} /> },
    { id: 'videos', label: '영상', icon: <Video size={14} /> },
  ]

  return (
    <div className="flex flex-col h-[100dvh] bg-theme-page">
      <div className="flex-none px-4 pt-6 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/profile')}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-theme-surface transition-colors"
          >
            <ArrowLeft size={18} strokeWidth={2} className="text-theme-primary" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-theme-primary">Admin</h1>
            <p className="text-xs text-theme-muted">@{user?.username}</p>
          </div>
        </div>

        <div className="flex rounded-xl bg-theme-surface overflow-hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setSearchParams({ tab: tab.id }); setVideoPage(1); setUserSearchInput(''); setUserSearch(''); setUserPage(1) }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id ? 'bg-accent text-accent-fg' : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">

      {activeTab === 'users' && (
        <div className="space-y-3">
          <div className="sticky top-0 z-10 -mx-4 bg-theme-page px-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                <input
                  value={userSearchInput}
                  onChange={(e) => setUserSearchInput(e.target.value)}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="닉네임, 이메일, ID 검색"
                  className="w-full rounded-xl border border-theme-border bg-theme-surface py-3 pl-9 pr-9 text-sm text-theme-primary placeholder:text-theme-subtle outline-none focus:border-accent"
                />
                {userSearchInput && (
                  <button
                    type="button"
                    onClick={() => { setUserSearchInput(''); setUserSearch('') }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary"
                    aria-label="검색어 지우기"
                  >
                    <X size={14} />
                  </button>
                )}
                {showSuggestions && users.length > 0 && userSearchInput && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-theme-border bg-theme-surface shadow-lg overflow-hidden">
                    {users.slice(0, 5).map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onMouseDown={() => { setUserSearchInput(u.username); setShowSuggestions(false) }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-theme-surface2 flex items-center gap-2"
                      >
                        <span className="font-semibold text-theme-primary">@{u.username}</span>
                        {u.email && <span className="text-xs text-theme-muted truncate">{u.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => refetchUsers()}
                disabled={usersFetching}
                className="shrink-0 rounded-xl border border-theme-border bg-theme-surface p-3 text-theme-muted hover:text-theme-primary disabled:opacity-40"
                aria-label="새로고침"
              >
                <RefreshCw size={14} className={usersFetching ? 'animate-spin' : ''} />
              </button>
            </div>
            {!usersLoading && !usersError && usersData && (
              <p className="mt-2 text-xs text-theme-muted">
                {userSearch ? `${usersData.total}명 검색됨` : `전체 ${usersData.total}명`}
              </p>
            )}
          </div>

          {usersLoading && <p className="text-center text-theme-muted py-10">불러오는 중...</p>}
          {!usersLoading && usersError && <p className="text-center text-red-400 py-10">조회 실패</p>}
          {!usersLoading && !usersError && users.length === 0 && (
            <p className="text-center text-theme-subtle py-10">{userSearch ? '검색 결과가 없습니다' : '유저가 없습니다'}</p>
          )}
          {users.map((u) => (
            <div key={u.id} className="rounded-xl bg-theme-surface p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-theme-primary">@{u.username}</p>
                    {u.is_admin && (
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">admin</span>
                    )}
                    {u.auth_provider === 'google' && (
                      <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded-full">Google</span>
                    )}
                    {u.auth_provider === 'lightning' && (
                      <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded-full">Lightning</span>
                    )}
                    {u.auth_provider === 'email' && (
                      <span className="text-[10px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded-full">Email</span>
                    )}
                  </div>
                  <p className="text-xs text-theme-muted">{u.email ?? '이메일 없음'}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-theme-subtle">
                    <span>영상 {u.video_count}개</span>
                    <span>챌린지 {u.challenge_count}개</span>
                    <span>{Number(u.total_points).toFixed(2)}L</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setSelectedUserId(u.id)}
                  className="flex items-center gap-1.5 rounded-lg bg-theme-surface2 px-3 py-2 text-xs font-semibold text-theme-muted hover:text-theme-primary"
                >
                  <ChevronRight size={12} />
                  상세
                </button>
                <button
                  onClick={() => setDeleteUserConfirm({ id: u.id, username: u.username })}
                  disabled={deleteUser.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Trash2 size={12} />
                  삭제
                </button>
              </div>
            </div>
          ))}

          {usersData && (
            <div className="flex items-center justify-between px-2 py-3 text-sm text-theme-muted">
              <button disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)} className="disabled:opacity-40">이전</button>
              <span>페이지 {userPage} / {Math.ceil(usersData.total / 20)}</span>
              <button disabled={!usersData.has_next} onClick={() => setUserPage(p => p + 1)} className="disabled:opacity-40">다음</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'videos' && (
        <div className="space-y-4">
          <div className="px-1">
            <p className="text-xs text-theme-muted">
              {videoTotal > 0 ? `총 ${videoTotal}개 · ${videoPage}/${videoTotalPages} 페이지` : ''}
            </p>
          </div>

          {videosLoading && <p className="text-center text-theme-muted py-10">불러오는 중...</p>}
          {!videosLoading && videosError && <p className="text-center text-red-400 py-10">조회 실패</p>}
          {!videosLoading && !videosError && videos.length === 0 && (
            <p className="text-center text-theme-subtle py-10">영상이 없습니다</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {videos.map((v) => (
              <div key={v.id} className="rounded-xl bg-theme-surface overflow-hidden">
                <div className="relative aspect-[9/16] bg-black">
                  {v.thumbnail_url ? (
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <video
                      src={v.cdn_url}
                      className="w-full h-full object-cover"
                      preload="none"
                      muted
                      playsInline
                      onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLVideoElement
                        el.pause()
                        el.currentTime = 0
                      }}
                    />
                  )}
                  {v.duration_sec != null && (
                    <span className="absolute bottom-2 right-2 text-[10px] font-semibold bg-black/70 text-white px-1.5 py-0.5 rounded">
                      {Math.floor(v.duration_sec / 60)}:{String(v.duration_sec % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <div className="p-2.5 space-y-1.5">
                  <p className="text-xs font-semibold text-theme-primary truncate">@{v.username}</p>
                  <p className="text-[10px] text-theme-subtle">
                    {new Date(v.created_at).toLocaleDateString('ko-KR')}
                  </p>
                  <button
                    onClick={() => setDeleteVideoConfirmId(v.id)}
                    disabled={deleteVideo.isPending}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    <Trash2 size={12} />
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>

          {videoTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setVideoPage((p) => Math.max(1, p - 1))}
                disabled={videoPage === 1}
                className="rounded-lg bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-muted disabled:opacity-40"
              >
                이전
              </button>
              <span className="text-sm text-theme-muted">{videoPage} / {videoTotalPages}</span>
              <button
                onClick={() => setVideoPage((p) => Math.min(videoTotalPages, p + 1))}
                disabled={videoPage === videoTotalPages}
                className="rounded-lg bg-theme-surface px-4 py-2 text-sm font-semibold text-theme-muted disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}

      {selectedUserId !== null && (
        <UserDetailPanel userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}

      {deleteVideoConfirmId !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteVideoConfirmId(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-theme-surface px-6 pt-5 pb-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-theme-primary mb-1">영상 삭제</p>
            <p className="text-sm text-theme-muted mb-5">삭제하면 복구할 수 없습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteVideoConfirmId(null)} className="flex-1 rounded-xl bg-theme-surface2 py-3 text-sm text-theme-muted">취소</button>
              <button
                onClick={() => { deleteVideo.mutate(deleteVideoConfirmId); setDeleteVideoConfirmId(null) }}
                disabled={deleteVideo.isPending}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteVideo.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteUserConfirm !== null && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteUserConfirm(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-theme-surface px-6 pt-5 pb-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-theme-primary mb-1">@{deleteUserConfirm.username} 계정 삭제</p>
            <p className="text-sm text-theme-muted mb-5">영상, 포인트 등 모든 데이터가 삭제됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteUserConfirm(null)} className="flex-1 rounded-xl bg-theme-surface2 py-3 text-sm text-theme-muted">취소</button>
              <button
                onClick={() => { deleteUser.mutate(deleteUserConfirm.id); setDeleteUserConfirm(null) }}
                disabled={deleteUser.isPending}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteUser.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
