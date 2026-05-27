import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy, ArrowLeft, Dumbbell, Heart, Eye, MessageCircle } from 'lucide-react'
import client from '../api/client'
import type { UserProfile } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'
import UserAvatar from '../components/UserAvatar'

type Tab = 'videos' | 'challenges' | 'titles'

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('videos')

  const { data, isLoading, isError } = useQuery<UserProfile>({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const res = await client.get<{ data: UserProfile }>(`/users/${userId}/profile`)
      return res.data.data
    },
    enabled: !!userId,
  })

  if (isLoading) return <LoadingScreen />

  if (isError || !data) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-2 bg-theme-page">
        <p className="text-sm text-theme-muted">존재하지 않는 사용자예요</p>
      </div>
    )
  }

  const { user, post_count, posts, titles, active_challenges } = data

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'videos', label: '영상', count: post_count },
    { key: 'challenges', label: '챌린지', count: active_challenges.length },
    { key: 'titles', label: '타이틀', count: titles.length },
  ]

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-nav-safe">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <button onClick={() => navigate(-1)} className="text-theme-muted flex-shrink-0">
          <ArrowLeft size={20} />
        </button>
        <UserAvatar
          username={user.username}
          avatarUrl={user.avatar_url}
          size={40}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-theme-primary leading-tight">@{user.username}</p>
          <p className="text-xs text-theme-muted">{post_count}개 업로드</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1.5 px-4 mb-4">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 rounded-xl py-2 text-xs font-medium transition-colors ${
              activeTab === key
                ? 'bg-accent text-accent-fg'
                : 'bg-theme-surface text-theme-muted'
            }`}
          >
            {label}
            <span className="ml-1 opacity-70">{count}</span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'videos' && (
        posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-sm text-theme-muted">아직 업로드한 영상이 없어요</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-px mx-px">
            {posts.map((post) => (
              <div
                key={post.id}
                className="relative aspect-[9/16] overflow-hidden bg-theme-surface"
              >
                <video
                  src={post.cdn_url}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
                <div className="absolute inset-0 bg-black/30" />
                <div className="absolute bottom-1.5 left-1 right-1 flex items-center justify-between text-white/90">
                  <div className="flex items-center gap-1">
                    <Heart size={9} strokeWidth={2} />
                    <span className="text-[9px] font-medium">{post.like_count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle size={9} strokeWidth={2} />
                    <span className="text-[9px] font-medium">{post.comment_count}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye size={9} strokeWidth={2} />
                    <span className="text-[9px] font-medium">{post.view_count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {activeTab === 'challenges' && (
        <div className="px-4">
          {active_challenges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Dumbbell size={36} className="text-theme-surface2" strokeWidth={1.5} />
              <p className="text-sm text-theme-muted">참여 중인 챌린지가 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {active_challenges.map((c) => {
                const progress = Math.min(
                  100,
                  Math.round((c.upload_count / c.condition_value) * 100),
                )
                return (
                  <div
                    key={c.challenge_id}
                    className="rounded-2xl bg-theme-surface px-4 py-3 cursor-pointer active:opacity-80"
                    onClick={() => navigate(`/challenges/${c.challenge_id}`)}
                  >
                    <div className="flex justify-between items-center text-sm mb-2">
                      <span className="font-medium text-theme-primary truncate flex-1 mr-2">
                        {c.title}
                      </span>
                      <span className="text-xs text-theme-muted flex-shrink-0">
                        {c.upload_count}/{c.condition_value}회
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-theme-surface2">
                      <div
                        className="h-1.5 rounded-full bg-accent transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-theme-muted mt-1.5">{progress}% 달성</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'titles' && (
        <div className="px-4">
          {titles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Trophy size={36} className="text-theme-surface2" strokeWidth={1.5} />
              <p className="text-sm text-theme-muted">아직 획득한 타이틀이 없어요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {titles.map((t, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-theme-surface px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <Trophy size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-accent">{t.title}</p>
                    <p className="text-xs text-theme-muted truncate">{t.challenge_title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
