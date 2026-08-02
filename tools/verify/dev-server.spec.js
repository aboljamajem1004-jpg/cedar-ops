import { test, expect } from '@playwright/test'
import { TICK_HZ } from '../../shared/constants.js'
import { DEV_URL } from './playwright.config.js'

/**
 * shared/constants.js lives outside Vite's root (client/). The bundler handles
 * it at build time, but the dev server refuses to read outside its root unless
 * server.fs.allow says otherwise. This test fails loudly if that config is ever
 * dropped, instead of the problem showing up only when running `npm run dev`.
 */
test('dev server boots and resolves the cross-root shared/ import', async ({ page }) => {
  /** @type {string[]} */ const consoleErrors = []
  /** @type {string[]} */ const pageErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })
  page.on('pageerror', (e) => pageErrors.push(e.message))

  await page.goto(DEV_URL)
  await page.waitForFunction(() => window.__CEDAR_READY__ === true, null, { timeout: 30_000 })

  const tickHz = await page.evaluate(() => window.__CEDAR_DEBUG__.tickHz)

  console.log(`\ndev server: shared/constants.js resolved, tickHz = ${tickHz}\n`)

  expect(pageErrors, 'uncaught page errors in dev').toEqual([])
  expect(consoleErrors, 'console errors in dev').toEqual([])
  expect(tickHz, 'shared/constants.js resolved on the dev server').toBe(TICK_HZ)
})
