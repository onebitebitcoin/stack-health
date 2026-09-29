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

export async function deleteRound(id: number): Promise<void> {
  await client.delete(`/admin/harvest/rounds/${id}`)
}
