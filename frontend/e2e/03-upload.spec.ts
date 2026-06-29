import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('업로드 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page)
  })

  test('업로드 페이지 3단계 진행바', async ({ page }) => {
    await page.goto('/upload')
    await page.screenshot({ path: 'e2e/screenshots/07-upload-step0.png', fullPage: true })

    const stepBar = page.locator('[data-testid="step-bar"]')
    await expect(stepBar.locator('text=미디어')).toBeVisible()
    await expect(stepBar.locator('text=음성·자막')).toBeVisible()
    await expect(stepBar.locator('text=챌린지·정보')).toBeVisible()
  })

  test('업로드 Step 0: 미디어 선택 UI', async ({ page }) => {
    await page.goto('/upload')
    await page.screenshot({ path: 'e2e/screenshots/08-upload-file-select.png', fullPage: true })

    await expect(page.locator('text=영상 또는 사진을 올리세요')).toBeVisible()
  })
})
