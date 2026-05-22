import { test, expect } from '@playwright/test'

test.describe('브랜드 공유 패키지', () => {
  test('정적 메타데이터와 공유 이미지 자산을 제공한다', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveTitle('Stack Health | 운동 기록이 스코어가 되는 커뮤니티')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      '15초 운동 기록을 공유하고, 커뮤니티 반응과 스코어로 꾸준함을 이어가세요.',
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'Stack Health | 운동 기록이 스코어가 되는 커뮤니티',
    )
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      '15초 운동 기록을 공유하고, 커뮤니티 반응과 스코어로 꾸준함을 이어가세요.',
    )
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', '/og-image.svg')
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.svg')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.svg')

    const ogResponse = await page.request.get('/og-image.svg')
    expect(ogResponse.ok()).toBeTruthy()
    expect(ogResponse.headers()['content-type']).toContain('image/svg+xml')
  })

  test('로그인 첫 화면에 로고와 성장/커뮤니티/스코어 카피를 노출한다', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByLabel('Stack Health 로고')).toBeVisible()
    await expect(page.getByText('운동 기록이 쌓이면 스코어가 됩니다')).toBeVisible()
    await expect(page.getByText(/커뮤니티 반응.*꾸준함/)).toBeVisible()
  })
})
