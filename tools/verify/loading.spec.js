import { test, expect } from '@playwright/test'

/**
 * Boot feedback.
 *
 * Reported from a phone: the stress scene took a long time to appear with no
 * indication anything was happening — a black screen and a zeroed overlay is
 * indistinguishable from a broken build.
 */

test('a loading screen shows during boot and clears once rendering starts', async ({ page }) => {
  await page.goto('./?debug=1')

  const loading = page.locator('#loading')
  // Static markup, so it is on screen before any JavaScript parses.
  await expect(loading).toBeVisible()

  await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 60_000 })
  await expect(loading).toBeHidden({ timeout: 10_000 })
})

test('the loading screen reports progress rather than sitting blank', async ({ page }) => {
  await page.goto('./?debug=1&stress=2')

  const status = page.locator('#loading-status')
  await expect(status).not.toHaveText('', { timeout: 10_000 })

  await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 90_000 })
  await expect(page.locator('#loading')).toBeHidden({ timeout: 10_000 })
})

test('a failed asset shows a visible error instead of a black screen', async ({ page }) => {
  // Nobody has devtools open on a phone, so a console error alone is invisible.
  await page.route('**/character-male.glb', (route) => route.abort())

  await page.goto('./?debug=1&stress=2')

  const errorBox = page.locator('#loading-error')
  await expect(errorBox).toBeVisible({ timeout: 60_000 })
  await expect(errorBox).toContainText('character')

  // The failure must stay on screen — a half-loaded game that looks playable is
  // worse than an obvious error.
  await expect(page.locator('#loading')).toBeVisible()
  await page.waitForTimeout(1500)
  await expect(errorBox).toBeVisible()
})
