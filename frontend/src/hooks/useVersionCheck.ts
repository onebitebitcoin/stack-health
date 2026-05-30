import { useEffect, useState } from 'react'

const POLL_INTERVAL = 60_000

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/health', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const serverVersion: string = json.version
        if (serverVersion && serverVersion !== __APP_VERSION__) {
          setUpdateAvailable(true)
        }
      } catch {
        // 네트워크 오류 시 무시
      }
    }

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') check()
    }, POLL_INTERVAL)

    function onVisibility() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return updateAvailable
}
