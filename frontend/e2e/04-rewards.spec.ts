import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('리워드/프로필/어드민', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page)
  })

  test('리워드 페이지', async ({ page }) => {
    await page.goto('/rewards')
    await page.screenshot({ path: 'e2e/screenshots/09-rewards.png', fullPage: true })

    // 신규 유저는 summary API가 반환되면 이번 주 포인트 헤더가 표시됨
    await expect(page.locator('text=이번 주 포인트').first()).toBeVisible({ timeout: 8000 })
  })

  test('프로필 페이지', async ({ page }) => {
    await page.goto('/profile')
    await page.screenshot({ path: 'e2e/screenshots/10-profile.png', fullPage: true })

    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
  })

  test('어드민 페이지 — 비관리자 접근 제한', async ({ page }) => {
    await page.goto('/admin')
    await page.screenshot({ path: 'e2e/screenshots/11-admin.png', fullPage: true })

    // 일반 유저는 관리자 전용 메시지가 표시됨
    await expect(page.locator('text=관리자만 접근할 수 있습니다')).toBeVisible()
  })
})
