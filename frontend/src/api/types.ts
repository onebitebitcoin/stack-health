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
  comment_count: number
  is_liked: boolean
  created_at: string
  cdn_url: string
  username: string
  workout_start: string | null
  workout_end: string | null
}

export interface FeedResponse {
  posts: Post[]
  next_cursor: number | null
}

export interface RewardSummary {
  week_label: string
  current_week_points: number
  fixed_week_points: number
  queued_week_points: number
  satoshi_amount: number
  claimable: boolean
  deadline: string
  already_claimed: boolean
  claim_deadline: string
  next_claim_date: string
  contribution_pct: number
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
  email: string | null
  username: string
  is_banned: boolean
  is_admin: boolean
  auth_provider: 'google' | 'lightning' | 'email'
  video_count: number
  total_points: number
  challenge_count: number
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
  creator_id?: number | null
  completed_count?: number
  image_url?: string | null
}

export interface ChallengeUpdateRequest {
  description?: string
  categories?: string[]
}

export interface ChallengeParticipant {
  user_id: number
  username: string
  upload_count: number
  condition_value: number
  completed_at: string | null
  joined_at: string
  progress: number
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

export interface ProfilePost {
  id: number
  cdn_url: string
  like_count: number
  view_count: number
  caption: string | null
  created_at: string
}

export interface MyStats {
  total_posts: number
  total_points: number
  queued_points: number
  week_points: number
  week_queued_points: number
  week_sats: number
}

export interface LeaderboardEntry {
  rank: number
  user_id: number
  username: string
  avatar_url: string | null
  total_points: number
}

export interface LeaderboardResponse {
  data: LeaderboardEntry[]
  total: number
  page: number
  limit: number
  has_next: boolean
}

export interface MiningParticipant {
  claim_id: number
  user_id: number
  username: string
  ln_address: string
  points: number
  sats_bid: number
  hash_power_pct: number
}

export interface MiningParticipantsResponse {
  week_label: string
  participants: MiningParticipant[]
  total_pool_sats: number
  participant_count: number
}

export interface MiningRound {
  id: number
  week_label: string
  total_pool_sats: number
  sats_per_block: number
  total_blocks: number
  participant_count: number
  winner_count: number
  status: 'open' | 'distributed' | 'closed'
  created_at: string
  distributed_at: string | null
  closed_at: string | null
}

export interface LotteryResult {
  week_label: string
  total_pool_sats: number
  total_blocks: number
  sats_per_block: number
  participant_count: number
  winner_count: number
  results: { user_id: number; sats_won: number; status: string }[]
}

export interface WeeklyPointsItem {
  date: string
  points: number
  source: string
  post_id: number | null
  queued: boolean
}

export interface WeeklyPointsHistory {
  week_label: string
  week_number: number
  start_date: string
  end_date: string
  total_points: number
  items: WeeklyPointsItem[]
}
