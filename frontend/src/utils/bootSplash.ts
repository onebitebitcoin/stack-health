const BOOT_SPLASH_ID = 'boot-splash'
const FADE_MS = 250

/** index.html 의 부팅 로딩 화면을 페이드아웃 후 제거한다. 없으면 아무것도 하지 않는다. */
export function removeBootSplash(): void {
  const el = document.getElementById(BOOT_SPLASH_ID)
  if (!el) return
  el.style.opacity = '0'
  el.style.pointerEvents = 'none'
  window.setTimeout(() => el.remove(), FADE_MS)
}
