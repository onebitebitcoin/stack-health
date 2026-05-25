import type { Page } from '@playwright/test'

export async function registerAndLogin(page: Page) {
  await page.goto('/login')
  const ts = Date.now()
  const email = `test${ts}@example.com`
  const username = `user${ts}`
  const password = 'password123'

  // 이메일 로그인 모드로 전환 (기본 화면은 OAuth 목록)
  await page.click('text=이메일로 로그인')

  // 회원가입 모드로 전환
  await page.locator('text=계정이 없어요').click()

  await page.fill('input[type="email"]', email)
  await page.fill('input[placeholder="닉네임"]', username)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')

  // 피드로 이동될 때까지 대기
  await page.waitForURL('/', { timeout: 8000 })
}
