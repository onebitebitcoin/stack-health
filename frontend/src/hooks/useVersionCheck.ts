import { useEffect, useState } from 'react'

const POLL_INTERVAL = 60_000

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/health', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        const sv: string = json.version
        if (sv && sv !== __APP_VERSION__) {
          setServerVersion(sv)
          setUpdateAvailable(true)
          // 즉시 새 SW 다운로드 트리거 — 삼성 브라우저처럼 주기적 체크가 느린 환경 대응
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {})
          }
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

  return { updateAvailable, serverVersion }
}
