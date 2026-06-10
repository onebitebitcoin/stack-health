import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/media-recorder-merge.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    // 기본 UI는 한국어 기준으로 검증한다 (i18n LanguageDetector가 navigator 언어를 따르므로 고정)
    locale: 'ko-KR',
    screenshot: 'on',
    video: 'off',
    trace: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    // {
    //   name: 'android',
    //   use: { ...devices['Pixel 5'], hasTouch: true, isMobile: true },
    // },
    {
      name: 'iphone',
      use: {
        ...devices['iPhone 14'],
        // WebKit: Safari engine; tests safe-area CSS, input behaviour, etc.
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: [
    {
      command: 'cd ../backend && source .venv/bin/activate && uvicorn app.main:app --port 8000',
      port: 8000,
      timeout: 15000,
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev',
      port: 5173,
      timeout: 15000,
      reuseExistingServer: true,
    },
  ],
})
