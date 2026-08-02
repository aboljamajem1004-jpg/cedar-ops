import { test, expect } from '@playwright/test'

/**
 * The debug overlay is the only way to read performance numbers on a phone, so
 * the ways of opening it without a keyboard are covered here. A regression in
 * any of these makes the game unmeasurable on mobile.
 */

test.describe('desktop', () => {
  test('overlay is hidden by default in the production build', async ({ page }) => {
    await page.goto('./')
    await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })

    await expect(page.locator('#debug-overlay')).toBeHidden()
    // Touch controls must not appear on a device without a touchscreen.
    await expect(page.locator('#debug-toggle')).toHaveCount(0)
  })

  test('?debug=1 opens the overlay and it shows live numbers', async ({ page }) => {
    await page.goto('./?debug=1')
    await page.waitForFunction(() => window.__CEDAR_DEBUG__?.fps > 0, null, { timeout: 30_000 })

    const overlay = page.locator('#debug-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay).toContainText('fps')
    await expect(overlay).toContainText('draws')
    await expect(overlay).toContainText('qual')
  })
})

test.describe('touch device', () => {
  test.use({ hasTouch: true, viewport: { width: 412, height: 915 } })

  test('the DBG button toggles the overlay', async ({ page }) => {
    await page.goto('./')
    await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })

    const overlay = page.locator('#debug-overlay')
    const debugButton = page.locator('#debug-toggle')
    const qualityButton = page.locator('#quality-toggle')

    await expect(debugButton).toBeVisible()
    await expect(overlay).toBeHidden()
    await expect(qualityButton).toBeHidden()

    await debugButton.tap()
    await expect(overlay).toBeVisible()
    // Cycling quality is only offered once the numbers are readable.
    await expect(qualityButton).toBeVisible()

    // The overlay must have content the moment it opens, not at the next
    // one-second window boundary.
    await expect(overlay).toContainText('fps')

    await debugButton.tap()
    await expect(overlay).toBeHidden()
    await expect(qualityButton).toBeHidden()
  })

  test('the QUAL button changes preset across the reload MSAA requires', async ({ page }) => {
    // low -> medium switches MSAA on, which is fixed at context creation, so
    // this path reloads. ?debug=1 keeps the overlay open through it.
    await page.goto('./?q=low&debug=1')
    await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })
    await expect(page.locator('#debug-overlay')).toContainText('LOW')

    await page.locator('#quality-toggle').tap()

    // Survives the reload: the new preset has to be carried in the URL, or the
    // ?q= pin sends us straight back to LOW.
    await expect(page.locator('#debug-overlay')).toContainText('MEDIUM')
    expect(new URL(page.url()).searchParams.get('q')).toBe('medium')
  })

  test('a three-finger tap toggles the overlay', async ({ page }) => {
    await page.goto('./')
    await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })

    const overlay = page.locator('#debug-overlay')
    await expect(overlay).toBeHidden()

    await threeFingerTap(page)
    await expect(overlay).toBeVisible()
  })
})

/**
 * Playwright's tap() drives a single touch point, so the three-finger gesture
 * goes through the DevTools protocol instead. That produces real browser touch
 * input rather than a synthetic TouchEvent, which is what the listener would
 * actually receive on a phone.
 *
 * @param {import('@playwright/test').Page} page
 */
async function threeFingerTap(page) {
  const cdp = await page.context().newCDPSession(page)
  const touchPoints = [0, 1, 2].map((i) => ({ x: 120 + i * 50, y: 400 }))

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}
