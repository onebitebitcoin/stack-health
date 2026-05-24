import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import client from '../api/client'
import type { UserProfile } from '../api/types'
import LoadingScreen from '../components/LoadingScreen'

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>()

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

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-auto bg-theme-page pb-20">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-theme-surface2 text-sm font-bold text-theme-primary">
          {user.username[0]?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-theme-primary leading-tight">
            @{user.username}
          </p>
          <p className="text-xs text-theme-muted">{post_count}개 업로드</p>
        </div>
      </div>

      {/* 획득한 타이틀 */}
      {titles.length > 0 && (
        <div className="mx-4 mb-3">
          <div className="flex flex-wrap gap-2">
            {titles.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5"
                title={t.challenge_title}
              >
                <Trophy size={11} className="text-accent" />
                <span className="text-xs font-medium text-accent">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 참여 중인 챌린지 */}
      {active_challenges.length > 0 && (
        <div className="mx-4 mb-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-theme-muted mb-2">
            참여 중인 챌린지
          </p>
          <div className="flex flex-col gap-2">
            {active_challenges.map((c) => {
              const progress = Math.min(100, Math.round((c.upload_count / c.condition_value) * 100))
              return (
                <div key={c.challenge_id} className="rounded-xl bg-theme-surface px-3 py-2.5">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-theme-primary font-medium">{c.title}</span>
                    <span className="text-theme-muted">{c.upload_count}/{c.condition_value}</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-theme-surface2">
                    <div
                      className="h-1 rounded-full bg-accent"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 영상 그리드 */}
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
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
              <div className="absolute bottom-1 left-1 flex items-center gap-1">
                <span className="text-[10px] text-white drop-shadow">
                  {post.view_count > 999 ? `${Math.floor(post.view_count / 1000)}k` : post.view_count}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
