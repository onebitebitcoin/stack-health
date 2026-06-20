import { useQuery } from '@tanstack/react-query'
import client from '../api/client'
import { useAuthStore } from '../store/auth'

export function useUnreadNotifications() {
  const token = useAuthStore((s) => s.token)

  const { data } = useQuery<number>({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const res = await client.get<{ data: { count: number } }>('/notifications/unread-count')
      return res.data.data.count
    },
    enabled: !!token,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  return data ?? 0
}
