import { test, expect } from '@playwright/test'

// 영어 전환 스모크: localStorage app-language=en 상태에서 로그인 페이지가 영어로 렌더링되는지,
// ko 기본 상태에서 한국어로 렌더링되는지 확인한다.
test.describe('i18n language switching', () => {
  test('login page renders in English when app-language=en', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
    await page.goto('/login')
    await expect(page.getByText(/sign in|log in|login/i).first()).toBeVisible()
    const koreanCount = await page.locator('body').evaluate(
      (el) => (el.innerText.match(/[가-힣]/g) || []).length,
    )
    expect(koreanCount).toBe(0)
  })

  test('login page renders in Korean by default (app-language=ko)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('app-language', 'ko'))
    await page.goto('/login')
    const koreanCount = await page.locator('body').evaluate(
      (el) => (el.innerText.match(/[가-힣]/g) || []).length,
    )
    expect(koreanCount).toBeGreaterThan(0)
  })
})
