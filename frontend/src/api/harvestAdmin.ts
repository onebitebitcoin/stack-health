import client from './client'

export type HarvestCadence = 'weekly' | 'biweekly' | 'monthly'
export type HarvestRoundStatus = 'open' | 'paid'

export interface HarvestRound {
  id: number
  start_date: string
  end_date: string
  status: HarvestRoundStatus
  total_oranges: number
  seed: number | string
  paid_at: string | null
  // 관리자가 BTC 지급 완료로 표시한 시각 (null이면 미지급)
  btc_paid_at?: string | null
  participant_count: number
}

interface HarvestRowBase {
  user_id: number
  username: string
  uploads: number
  comments: number
  score: number
}

export interface HarvestOpenRow extends HarvestRowBase {
  probability_pct: number
  expected_oranges: number
}

export interface HarvestPaidRow extends HarvestRowBase {
  oranges: number
}

export interface HarvestRoundDetail {
  round: HarvestRound
  is_estimate: boolean
  rows: Array<HarvestOpenRow | HarvestPaidRow>
}

export interface CreateRoundPayload {
  start_date: string
  end_date: string
  seed?: number
}

export interface GenerateRoundsPayload {
  year: number
  month: number
  cadence: HarvestCadence
}

export async function fetchRounds(month: string): Promise<HarvestRound[]> {
  const res = await client.get<{ data: HarvestRound[] }>('/admin/harvest/rounds', { params: { month } })
  return res.data.data
}

export async function createRound(payload: CreateRoundPayload): Promise<HarvestRound> {
  const res = await client.post<{ data: HarvestRound }>('/admin/harvest/rounds', payload)
  return res.data.data
}

export async function generateRounds(payload: GenerateRoundsPayload): Promise<HarvestRound[]> {
  const res = await client.post<{ data: HarvestRound[] }>('/admin/harvest/rounds/generate', payload)
  return res.data.data
}

export async function fetchRoundDetail(id: number): Promise<HarvestRoundDetail> {
  const res = await client.get<{ data: HarvestRoundDetail }>(`/admin/harvest/rounds/${id}`)
  return res.data.data
}

export async function payRound(id: number): Promise<HarvestRound> {
  const res = await client.post<{ data: HarvestRound }>(`/admin/harvest/rounds/${id}/pay`)
  return res.data.data
}

// 확정된 회차는 force=true 없이는 서버가 409로 거부한다
export async function deleteRound(id: number, force = false): Promise<void> {
  if (force) {
    await client.delete(`/admin/harvest/rounds/${id}`, { params: { force: true } })
    return
  }
  await client.delete(`/admin/harvest/rounds/${id}`)
}

export interface HarvestSettings {
  collect_enabled: boolean
}

export interface HarvestUserStatusRow {
  user_id: number
  username: string
  growing: number
  ripe: number
  collected: number
  total: number
  /** 선택한 달 전체 오렌지 중 비율(%) */
  share_pct: number
}

export interface HarvestUserStatus {
  month: string
  pool_oranges: number
  rows: HarvestUserStatusRow[]
}

export async function fetchHarvestSettings(): Promise<HarvestSettings> {
  const res = await client.get<{ data: HarvestSettings }>('/admin/harvest/settings')
  return res.data.data
}

export async function updateHarvestSettings(collectEnabled: boolean): Promise<HarvestSettings> {
  const res = await client.put<{ data: HarvestSettings }>('/admin/harvest/settings', { collect_enabled: collectEnabled })
  return res.data.data
}

export async function fetchHarvestUserStatus(month: string): Promise<HarvestUserStatus> {
  const res = await client.get<{ data: HarvestUserStatus }>('/admin/harvest/users', { params: { month } })
  return res.data.data
}
