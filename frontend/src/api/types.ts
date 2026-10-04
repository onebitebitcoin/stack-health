export interface User {
  id: number
  email: string | null
  username: string
  lightning_address: string | null
  avatar_url: string | null
  is_admin: boolean
  app_settings: Record<string, unknown>
}

/** 게시물 공개 범위. private 은 작성자 본인에게만 보이고 피드·공유 링크에서 빠진다. */
export type PostVisibility = 'public' | 'private'

export interface Post {
  id: number
  video_id: number
  user_id: number
  caption: string | null
  tags: string[]
  like_count: number
  view_count: number
  comment_count: number
  is_liked: boolean
  created_at: string
  cdn_url: string
  username: string
  workout_start: string | null
  workout_end: string | null
  share_token: string
  thumbnail_url: string | null
  subtitle_url: string | null
  subtitle_text: string | null
  subtitle_status: string
  avatar_url: string | null
  profile_color: string | null
  visibility: PostVisibility
}

export interface FeedResponse {
  posts: Post[]
  next_cursor: number | null
}

export interface AdminVideo {
  id: number
  user_id: number
  username: string
  r2_key: string
  cdn_url: string
  thumbnail_url: string | null
  duration_sec: number | null
  status: string
  created_at: string
}

export interface AdminUser {
  id: number
  email: string | null
  username: string
  is_banned: boolean
  is_admin: boolean
  auth_provider: 'google' | 'lightning' | 'email'
  video_count: number
  challenge_count: number
  referred_count: number
  referred_by_username: string | null
  lightning_address: string | null
  created_at: string
}

export interface AdminUsersResponse {
  users: AdminUser[]
  total: number
  page: number
  limit: number
  has_next: boolean
}

export interface Comment {
  id: number
  post_id: number
  user_id: number
  parent_id: number | null
  username: string
  avatar_url: string | null
  profile_color: string | null
  content: string
  created_at: string
  like_count: number
  is_liked: boolean
  replies?: Comment[]
}

export interface HistoryWorkoutPost {
  id: number
  cdn_url: string
  like_count: number
  view_count: number
  caption: string | null
  thumbnail_url?: string | null
  subtitle_url?: string | null
  subtitle_text?: string | null
  subtitle_status?: string
}

export interface HistoryResponse {
  year: number
  month: number
  streak: number
  total_days: number
  workout_days: Record<string, HistoryWorkoutPost[]>
}

export interface Challenge {
  id: number
  title: string
  description: string
  reward_title: string
  condition_value: number
  start_date: string
  end_date: string
  is_active: boolean
  participant_count: number
  my_upload_count: number
  joined: boolean
  completed: boolean
  categories: string[]
  creator_id?: number | null
  creator_username?: string | null
  completed_count?: number
  image_url?: string | null
  image_thumb_url?: string | null
  goal_description?: string | null
  recruit_start?: string | null
  recruit_end?: string | null
  max_participants?: number | null
  is_recruiting?: boolean
}

export interface ChallengeParticipant {
  user_id: number
  username: string
  upload_count: number
  post_count: number
  condition_value: number
  completed_at: string | null
  joined_at: string
  progress: number
}

export interface ChallengeVideo {
  post_id: number
  user_id: number
  username: string
  avatar_url: string | null
  cdn_url: string
  thumbnail_url: string | null
  subtitle_url?: string | null
  subtitle_text?: string | null
  subtitle_status?: string
  caption: string | null
  created_at: string
}

export interface EarnedTitle {
  title: string
  challenge_title: string
  completed_at: string
}

export interface PublicPost {
  id: number
  cdn_url: string
  like_count: number
  view_count: number
  comment_count: number
  caption: string | null
  created_at: string
  thumbnail_url?: string | null
  subtitle_url?: string | null
  subtitle_text?: string | null
  subtitle_status?: string
}

export interface ActiveChallenge {
  challenge_id: number
  title: string
  upload_count: number
  condition_value: number
}

export interface UserProfile {
  user: {
    id: number
    username: string
    avatar_url: string | null
    created_at: string
  }
  post_count: number
  posts: PublicPost[]
  titles: EarnedTitle[]
  active_challenges: ActiveChallenge[]
  follower_count: number
  following_count: number
  is_following: boolean
}

export interface FollowUser {
  id: number
  username: string
  avatar_url: string | null
  profile_color: string | null
  is_following: boolean
}

export interface MyStats {
  total_posts: number
}

export type SubtitleLanguage = 'ko' | 'en' | 'auto'

export interface NotificationActor {
  id: number
  username: string
  avatar_url: string | null
  profile_color: string | null
}

export interface AppNotification {
  id: number
  type: 'comment' | 'like' | 'follow'
  post_id: number | null
  comment_id: number | null
  is_read: boolean
  created_at: string
  actor: NotificationActor
}

export interface SurveyQuestion {
  id: string
  type: 'scale' | 'single' | 'multi' | 'text'
  title: string
  description: string | null
  required: boolean
  options: string[] | null
  scale_min: number | null
  scale_max: number | null
  scale_min_label: string | null
  scale_max_label: string | null
}

export interface Survey {
  id: number
  slug: string
  title: string
  description: string | null
  questions: SurveyQuestion[]
  is_active: boolean
  is_open: boolean
  closes_at: string | null
  created_at: string
  updated_at: string
}

export interface SurveyListItem {
  id: number
  slug: string
  title: string
  is_open: boolean
  is_active: boolean
  closes_at: string | null
  response_count: number
  created_at: string
}

export interface SurveyResponse {
  id: number
  answers: Record<string, unknown>
  created_at: string
}

export type SurveyAggregateScaleValue = {
  avg: number
  count: number
  distribution: Record<string, number>
}

export type SurveyAggregateOptionValue = Record<string, number>

export type SurveyAggregateValue = SurveyAggregateScaleValue | SurveyAggregateOptionValue

export type SurveyAggregate = Record<string, SurveyAggregateValue>

// 수확 오렌지: 오렌지 개수만 다룬다(사토시/가격 노출 금지).
export interface HarvestThisWeek {
  start_date: string
  end_date: string
  /** 이번 주에 자라는 오렌지(예상치, 오르내릴 수 있음) */
  oranges: number
  /** 나무에 달 열매 수 (이번 주 오렌지 기준) */
  fruit_count: number
  /** 이번 주 전체 오렌지 중 내 몫(%) */
  share_pct: number
}

export interface MyHarvest {
  /** 지금까지 수확한 오렌지. 수확 대기분은 포함하지 않는다 */
  total_collected: number
  this_week: HarvestThisWeek
  /** 끝난 주들의 수확 대기 오렌지 */
  ripe_oranges: number
  /** 관리자 스위치. false면 수확 버튼을 보이지 않는다 */
  collect_enabled: boolean
  /** 나무 열매 1개가 뜻하는 오렌지 개수 */
  oranges_per_fruit: number
}
