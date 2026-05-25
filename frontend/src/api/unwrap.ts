import type { AxiosResponse } from 'axios'

export function unwrap<T>(res: AxiosResponse<{ data: T }>): T {
  return res.data.data
}
