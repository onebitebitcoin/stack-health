import { test, expect } from '@playwright/test'

test.describe('브랜드 공유 패키지', () => {
  test('정적 메타데이터와 공유 이미지 자산을 제공한다', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveTitle('Stack Health | Stack Health')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      '건강과 비트코인, 두 마리 토끼를 한 번에',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Stack Health | Stack Health',
    )
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      '건강과 비트코인, 두 마리 토끼를 한 번에',
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', '/og-image.png')
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')

    const ogResponse = await page.request.get('/og-image.png')
    expect(ogResponse.ok()).toBeTruthy()
  })

  test('로그인 첫 화면에 로고를 노출한다', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByLabel('Stack Health 로고')).toBeVisible()
    await expect(page.locator('text=이메일로 로그인')).toBeVisible()
  })
})
