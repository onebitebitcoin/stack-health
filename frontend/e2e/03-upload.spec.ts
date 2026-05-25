import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

test.describe('업로드 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page)
  })

  test('업로드 페이지 5단계 진행바', async ({ page }) => {
    await page.goto('/upload')
    await page.screenshot({ path: 'e2e/screenshots/07-upload-step0.png', fullPage: true })

    const stepBar = page.locator('[data-testid="step-bar"]')
    await expect(stepBar.locator('text=영상 선택')).toBeVisible()
    await expect(stepBar.locator('text=태그')).toBeVisible()
    await expect(stepBar.locator('text=챌린지')).toBeVisible()
    await expect(stepBar.locator('text=음성 녹음')).toBeVisible()
    await expect(stepBar.locator('text=설명')).toBeVisible()
  })

  test('업로드 Step 0: 파일 선택 UI', async ({ page }) => {
    await page.goto('/upload')
    await page.screenshot({ path: 'e2e/screenshots/08-upload-file-select.png', fullPage: true })

    await expect(page.locator('text=영상을 선택하세요')).toBeVisible()
  })
})
