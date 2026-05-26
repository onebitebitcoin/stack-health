import { test, expect } from '@playwright/test'
import { registerAndLogin } from './helpers'

const FAKE_POST = {
  id: 1,
  video_id: 1,
  user_id: 1,
  username: 'testuser',
  caption: '테스트 운동 영상',
  tags: ['홈트'],
  like_count: 5,
  view_count: 10,
  comment_count: 2,
  is_liked: false,
  cdn_url: 'https://test-cdn.example.com/video.mp4',
  created_at: '2026-01-01T00:00:00',
}

test.describe('댓글 기능', () => {
  test.beforeEach(async ({ page }) => {
    // 피드 API 모킹 (route 설정 먼저, 그 후 로그인)
    await page.route('**/api/v1/feed**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { posts: [FAKE_POST], next_cursor: null },
        }),
      })
    })

    // 댓글 목록 API 모킹
    await page.route('**/api/v1/feed/1/comments**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            comments: [
              { id: 1, post_id: 1, user_id: 2, username: 'alice', content: '멋진 운동이에요!', created_at: '2026-01-01T01:00:00' },
              { id: 2, post_id: 1, user_id: 3, username: 'bob', content: '저도 따라해볼게요', created_at: '2026-01-01T02:00:00' },
            ],
          },
        }),
      })
    })

    // view API 무시
    await page.route('**/api/v1/feed/*/view**', (route) => route.fulfill({ status: 200, body: '{}' }))

    await registerAndLogin(page)
  })

  test('댓글 버튼 클릭 시 CommentSheet가 열린다', async ({ page }) => {
    // 피드 VideoCard 렌더링 대기
    const commentBtn = page.locator('[data-testid="comment-btn"]').first()
    await expect(commentBtn).toBeVisible({ timeout: 5000 })

    await page.screenshot({ path: 'e2e/screenshots/05-before-comment-click.png' })

    // CommentSheet 초기 상태 확인 (translate-y-full = 닫힘)
    const sheet = page.locator('[data-testid="comment-sheet"]').first()
    await expect(sheet).toHaveClass(/translate-y-full/)

    // 댓글 버튼 클릭
    await commentBtn.click()

    await page.screenshot({ path: 'e2e/screenshots/05-after-comment-click.png' })

    // CommentSheet가 열려야 함 (translate-y-0)
    await expect(sheet).toHaveClass(/translate-y-0/, { timeout: 2000 })
  })

  test('CommentSheet에 댓글 목록이 표시된다', async ({ page }) => {
    const commentBtn = page.locator('[data-testid="comment-btn"]').first()
    await expect(commentBtn).toBeVisible({ timeout: 5000 })
    await commentBtn.click()

    const sheet = page.locator('[data-testid="comment-sheet"]').first()
    await expect(sheet).toHaveClass(/translate-y-0/, { timeout: 2000 })

    await page.screenshot({ path: 'e2e/screenshots/05-comment-list.png' })

    // 댓글 내용 확인
    await expect(page.locator('text=멋진 운동이에요!')).toBeVisible()
    await expect(page.locator('text=저도 따라해볼게요')).toBeVisible()
  })

  test('CommentSheet 닫기 버튼이 동작한다', async ({ page }) => {
    const commentBtn = page.locator('[data-testid="comment-btn"]').first()
    await expect(commentBtn).toBeVisible({ timeout: 5000 })
    await commentBtn.click()

    const sheet = page.locator('[data-testid="comment-sheet"]').first()
    await expect(sheet).toHaveClass(/translate-y-0/, { timeout: 2000 })

    // X 버튼 클릭으로 닫기
    await page.locator('[data-testid="comment-sheet"] button').filter({ hasText: '' }).first().click()
    await page.screenshot({ path: 'e2e/screenshots/05-comment-closed.png' })

    await expect(sheet).toHaveClass(/translate-y-full/, { timeout: 2000 })
  })
})
