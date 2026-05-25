export interface User {
  id: number
  email: string
  username: string
  lightning_address: string | null
  avatar_url: string | null
  is_admin: boolean
  app_settings: Record<string, unknown>
}

export interface Post {
  id: number
  video_id: number
  user_id: number
  caption: string | null
  tags: string[]
  like_count: number
  view_count: number
  comment_count?: number
  is_liked?: boolean
  created_at: string
  cdn_url: string
  username: string
}

export interface FeedResponse {
  posts: Post[]
  next_cursor: number | null
}

export interface RewardSummary {
  week_label: string
  current_week_points: number
  satoshi_amount: number
  claimable: boolean
  deadline: string
  already_claimed: boolean
}

export interface Claim {
  id: number
  week_label: string
  points_used: number
  satoshi_amount: number
  ln_address: string
  status: 'pending' | 'paid' | 'failed' | 'cancelled'
  payment_memo: string | null
  created_at: string
}

export interface AdminClaim extends Claim {
  user_id: number
  username: string
  email: string
}

export interface AdminVideo {
  id: number
  user_id: number
  username: string
  r2_key: string
  cdn_url: string
  duration_sec: number | null
  status: string
  created_at: string
}

export interface AdminUser {
  id: number
  email: string
  username: string
  is_banned: boolean
  is_admin: boolean
  video_count: number
  created_at: string
}

export interface Comment {
  id: number
  post_id: number
  user_id: number
  username: string
  content: string
  created_at: string
}

export interface HistoryWorkoutPost {
  id: number
  cdn_url: string
  like_count: number
  view_count: number
  caption: string | null
}

export interface HistoryResponse {
  year: number
  month: number
  streak: number
  total_days: number
  workout_days: Record<string, HistoryWorkoutPost[]>
}

export interface AdminWeeklySummaryItem {
  rank: number
  user_id: number
  username: string
  weekly_points: number
  satoshi_amount: number
}

export interface AdminWeeklySummaryResponse {
  week_label: string
  items: AdminWeeklySummaryItem[]
  page: number
  has_next: boolean
  total_users: number
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
  caption: string | null
  created_at: string
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
}
