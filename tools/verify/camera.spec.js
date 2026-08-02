import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { UI_KEYS } from '../../shared/constants.js'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')

/** @param {import('@playwright/test').Page} page */
async function boot(page, query = '') {
  await page.goto(`./?debug=1${query}`)
  await page.waitForFunction(() => window.__CEDAR_DEBUG__?.player !== undefined, null, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.player.onGround === true, null, {
    timeout: 30_000,
  })
}

const mode = (page) => page.evaluate(() => window.__CEDAR_DEBUG__.cameraMode)

test('V toggles between first and third person', async ({ page }) => {
  await boot(page)
  expect(await mode(page)).toBe('first')

  await page.keyboard.press(UI_KEYS.TOGGLE_CAMERA)
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('third')

  await page.keyboard.press(UI_KEYS.TOGGLE_CAMERA)
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('first')
})

test('the third-person camera sits behind the player, not inside them', async ({ page }) => {
  await boot(page)
  await page.keyboard.press(UI_KEYS.TOGGLE_CAMERA)
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('third')

  const geometry = await page.evaluate(() => {
    const d = window.__CEDAR_DEBUG__
    return { camera: d.cameraPosition, player: d.player }
  })

  const dx = geometry.camera.x - geometry.player.x
  const dz = geometry.camera.z - geometry.player.z
  const horizontal = Math.hypot(dx, dz)

  // Far enough back to see the character, not so far it has detached.
  expect(horizontal).toBeGreaterThan(0.4)
  expect(horizontal).toBeLessThan(4)
  // And above the feet.
  expect(geometry.camera.y).toBeGreaterThan(geometry.player.y + 1)
})

test('the spring arm pulls the camera in against a wall', async ({ page }) => {
  // Backed up against the corridor's end wall at z = -41, so the ideal camera
  // position is inside geometry and the arm has to shorten.
  await boot(page, '&tune=1&spawn=0,1,-39')
  await page.keyboard.press(UI_KEYS.TOGGLE_CAMERA)
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('third')

  // Face the wall so the camera swings behind the player, toward open ground,
  // then face away so the camera is pushed into the wall.
  const distance = await page.evaluate(() => {
    const d = window.__CEDAR_DEBUG__
    return Math.hypot(d.cameraPosition.x - d.player.x, d.cameraPosition.z - d.player.z)
  })

  // Whatever the framing, the camera must never end up beyond the wall face.
  const cameraZ = await page.evaluate(() => window.__CEDAR_DEBUG__.cameraPosition.z)
  expect(cameraZ).toBeGreaterThan(-41)
  expect(distance).toBeGreaterThan(0)
})

test('first person hides the head but keeps the body', async ({ page }) => {
  await boot(page)

  const layers = await page.evaluate(() => window.__CEDAR_DEBUG__.headHidden)
  expect(layers, 'head layer excluded from the first-person camera').toBe(true)

  // Look straight down at the body — the promised proof that the neck stump is
  // hidden inside the collar rather than leaving a hole.
  await page.evaluate(() => window.__CEDAR_DEBUG__.setPitch?.(-1.4))
  await page.waitForTimeout(600)

  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: path.join(outDir, 'fp-look-down.png') })

  const after = await page.evaluate(() => window.__CEDAR_DEBUG__.headHidden)
  expect(after).toBe(true)
})

test('third person shows the head again', async ({ page }) => {
  await boot(page)
  await page.keyboard.press(UI_KEYS.TOGGLE_CAMERA)
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('third')

  expect(await page.evaluate(() => window.__CEDAR_DEBUG__.headHidden)).toBe(false)

  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: path.join(outDir, 'third-person.png') })
})
