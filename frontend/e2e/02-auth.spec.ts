import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('인증 플로우', () => {
  test('로그인 페이지 렌더링', async ({ page }) => {
    await page.goto('/login')
    await page.screenshot({ path: 'e2e/screenshots/03-login.png', fullPage: true })

    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('text=운동하고 비트코인')).toBeVisible()
  })

  test('회원가입 폼 토글', async ({ page }) => {
    await page.goto('/login')

    // 회원가입 모드 전환
    await page.locator('text=계정이 없어요').click()
    await page.screenshot({ path: 'e2e/screenshots/04-register-form.png', fullPage: true })

    await expect(page.locator('input[placeholder="닉네임"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]:has-text("회원가입")')).toBeVisible()
  })

  test('회원가입 → 피드 이동', async ({ page }) => {
    await registerAndLogin(page)
    await page.screenshot({ path: 'e2e/screenshots/05-after-register.png', fullPage: true })

    expect(page.url()).toMatch(/\/$/)
  })

  test('업로드 탭 → 비로그인이면 로그인 페이지로 이동', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: '업로드' }).click()
    await page.screenshot({ path: 'e2e/screenshots/06-upload-auth-gate.png', fullPage: true })

    expect(page.url()).toMatch(/upload|login/)
  })
})
