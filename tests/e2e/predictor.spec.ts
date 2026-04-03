import { test, expect, Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function login(page: Page) {
  await page.goto('/login')
  await page.fill('[name="email"]', process.env.TEST_USER_EMAIL ?? 'test@example.com')
  await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD ?? 'test_password')
  await page.click('[type="submit"]')
  await page.waitForURL('/predict')
}

// ─── Auth flow ────────────────────────────────────────────────────────────────
test.describe('Authentication', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/predict')
    await expect(page).toHaveURL(/login/)
  })

  test('shows login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
  })

  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="email"]', 'wrong@example.com')
    await page.fill('[name="password"]', 'wrongpassword')
    await page.click('[type="submit"]')
    await expect(page.locator('[role="alert"], .error-message')).toBeVisible()
  })
})

// ─── Prediction flow ──────────────────────────────────────────────────────────
test.describe('Predictions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('predict page loads with round tabs', async ({ page }) => {
    await expect(page.locator('text=Group stage')).toBeVisible()
    await expect(page.locator('text=Rd of 32')).toBeVisible()
    await expect(page.locator('text=Final')).toBeVisible()
  })

  test('match rows show team names and empty score inputs', async ({ page }) => {
    // First group stage match should be Mexico vs South Africa
    await expect(page.locator('text=Mexico')).toBeVisible()
    await expect(page.locator('text=South Africa').first()).toBeVisible()
    // Inputs should be blank by default
    const inputs = page.locator('input[type="number"]').first()
    await expect(inputs).toHaveValue('')
  })

  test('user can enter a prediction', async ({ page }) => {
    const inputs = page.locator('.score-input').first()
    await inputs.fill('2')
    await expect(inputs).toHaveValue('2')
  })

  test('confirmed prediction shows green checkmark', async ({ page }) => {
    const row = page.locator('.match-row').first()
    const [homeInput, awayInput] = await row.locator('.score-input').all()
    await homeInput.fill('2')
    await awayInput.fill('1')
    await expect(row.locator('.stag, text=✓')).toBeVisible({ timeout: 3000 })
  })

  test('shows countdown banner', async ({ page }) => {
    await expect(page.locator('.countdown-banner, [data-testid="countdown"]')).toBeVisible()
  })
})

// ─── Leaderboard ─────────────────────────────────────────────────────────────
test.describe('Leaderboard', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('leaderboard page renders', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('h1, .page-title')).toContainText(/leaderboard/i)
  })

  test('shows current user row highlighted', async ({ page }) => {
    await page.goto('/leaderboard')
    await expect(page.locator('.lb-row.you, [data-me="true"]')).toBeVisible({ timeout: 5000 })
  })
})

// ─── Tribe flow ───────────────────────────────────────────────────────────────
test.describe('Tribe', () => {
  test.beforeEach(async ({ page }) => { await login(page) })

  test('tribe page renders', async ({ page }) => {
    await page.goto('/tribe')
    // Either shows tribe content or a join prompt
    const content = page.locator('.tribe-content, text=Join a tribe, text=Create a tribe')
    await expect(content.first()).toBeVisible()
  })

  test('tribe chat tab is accessible', async ({ page }) => {
    await page.goto('/tribe')
    const chatTab = page.locator('button:has-text("Tribe chat"), button:has-text("Chat")')
    if (await chatTab.count() > 0) {
      await chatTab.click()
      await expect(page.locator('.chat-messages, [data-testid="chat"]')).toBeVisible()
    }
  })
})

// ─── Admin panel ─────────────────────────────────────────────────────────────
test.describe('Admin panel', () => {
  test('non-admin user is redirected away from /admin', async ({ page }) => {
    await login(page)
    await page.goto('/admin')
    await expect(page).not.toHaveURL('/admin')
  })
})
