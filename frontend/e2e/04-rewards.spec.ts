import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('리워드/프로필/어드민', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page)
  })

  test('리워드 페이지', async ({ page }) => {
    await page.goto('/rewards')
    await page.screenshot({ path: 'e2e/screenshots/09-rewards.png', fullPage: true })

    // 이번 주 포인트 헤더 확인 (첫 번째 매치만 사용)
    await expect(page.locator('text=이번 주 포인트').first()).toBeVisible()
  })

  test('프로필 페이지', async ({ page }) => {
    await page.goto('/profile')
    await page.screenshot({ path: 'e2e/screenshots/10-profile.png', fullPage: true })

    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible()
  })

  test('어드민 페이지', async ({ page }) => {
    await page.goto('/admin')
    await page.screenshot({ path: 'e2e/screenshots/11-admin.png', fullPage: true })

    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
    await expect(page.getByPlaceholder('Admin Key')).toBeVisible()
  })
})
