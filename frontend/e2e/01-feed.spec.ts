import { test, expect } from '@playwright/test'

test.describe('피드 페이지', () => {
  test('피드 페이지 기본 렌더링', async ({ page }) => {
    await page.goto('/')
    await page.screenshot({ path: 'e2e/screenshots/01-feed-empty.png', fullPage: true })

    const emptyMsg = page.locator('text=아직 업로드된 영상이 없어요')
    const hasVideos = page.locator('video')
    const isEmpty = await emptyMsg.isVisible().catch(() => false)

    if (isEmpty) {
      await expect(emptyMsg).toBeVisible()
    } else {
      await expect(hasVideos.first()).toBeVisible()
    }
  })

  test('BottomNav 4탭 표시', async ({ page }) => {
    await page.goto('/')
    await page.screenshot({ path: 'e2e/screenshots/02-bottomnav.png', fullPage: true })

    // BottomNav 링크(a 태그) 기준으로 확인
    await expect(page.getByRole('link', { name: '피드' })).toBeVisible()
    await expect(page.getByRole('link', { name: '업로드' })).toBeVisible()
    await expect(page.getByRole('link', { name: '리워드' })).toBeVisible()
    await expect(page.getByRole('link', { name: '프로필' })).toBeVisible()
  })
})
