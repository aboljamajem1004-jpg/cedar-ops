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

test('holding V does not strobe the camera', async ({ page }) => {
  await boot(page)
  expect(await mode(page)).toBe('first')

  // Playwright's keyboard.down() sends a single keydown and never simulates OS
  // auto-repeat, so driving this through the normal input path cannot reach the
  // bug. The browser marks repeats with event.repeat, so they are dispatched
  // directly.
  //
  // Three repeats after the initial press, for four events total. That count
  // matters: an EVEN number of unguarded toggles returns to 'first', while the
  // guard allows exactly one and lands on 'third'. An odd total would end on
  // 'third' either way and the test would pass against the bug.
  await page.evaluate((code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: false, bubbles: true }))
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true, bubbles: true }))
    }
  }, UI_KEYS.TOGGLE_CAMERA)

  await expect
    .poll(() => mode(page), { timeout: 5000 })
    .toBe('third')
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

test('no head parts remain visible while running', async ({ page }) => {
  // Standing still is the state that hid two bugs: limbs flickering from stale
  // skinned-mesh culling bounds, and eyes and eyebrows left floating because
  // they are separate meshes that were never tagged as head. Both only appear
  // once an animation is running, so this samples mid-stride.
  await boot(page)

  const parts = await page.evaluate(() => window.__CEDAR_DEBUG__.headParts)
  // Head, plus eyes and eyebrows as their own meshes.
  expect(parts, 'every head-region mesh is on the head layer').toBeGreaterThanOrEqual(3)

  await page.evaluate(() => window.__CEDAR_DEBUG__.setPitch?.(-1.1))
  await page.keyboard.down('KeyW')
  await page.waitForFunction(() => window.__CEDAR_DEBUG__.player.speed > 4, null, {
    timeout: 30_000,
  })

  // Sample several frames mid-run: a flicker shows up in some frames and not
  // others, so one screenshot could easily miss it.
  fs.mkdirSync(outDir, { recursive: true })
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(220)
    await page.screenshot({ path: path.join(outDir, `fp-running-${i}.png`) })
  }

  const culling = await page.evaluate(() => window.__CEDAR_DEBUG__.bodyCulled)
  await page.keyboard.up('KeyW')

  // Frustum culling off for the local body — its bounds come from the bind
  // pose and go stale the moment it animates.
  expect(culling, 'local body is never frustum-culled').toBe(false)
})

test('third person shows the head again', async ({ page }) => {
  await boot(page)
  await page.keyboard.press(UI_KEYS.TOGGLE_CAMERA)
  await expect.poll(() => mode(page), { timeout: 5000 }).toBe('third')

  expect(await page.evaluate(() => window.__CEDAR_DEBUG__.headHidden)).toBe(false)

  fs.mkdirSync(outDir, { recursive: true })
  await page.screenshot({ path: path.join(outDir, 'third-person.png') })
})
