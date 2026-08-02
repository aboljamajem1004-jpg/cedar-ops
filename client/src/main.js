import { createRenderer, samplePixels, isMobile } from './core/renderer.js'
import { startLoop } from './core/loop.js'
import { createScene } from './game/scene.js'
import { createDebugOverlay } from './ui/debug-overlay.js'
import { createAutoScaler } from './core/autoscale.js'
import { createPhysics } from './core/physics.js'
import { createInput } from './core/input.js'
import { createPlayer } from './game/player.js'
import { createFirstPersonCamera } from './game/camera-fp.js'
import { createBlockout } from './game/blockout.js'
import { resolveTuning, resolveSpawn } from './core/tuning.js'
import { createAssets } from './core/assets.js'
import { createStressScene, measureTextureMemory } from './game/stress.js'
import { createLoadingScreen } from './ui/loading.js'
import {
  resolveLevel,
  settingsFor,
  storeLevel,
  nextLevel,
  requiresReload,
  isManual,
  setManual,
} from './core/quality.js'

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'))
const loading = createLoadingScreen()

// Anything thrown after this point still reaches the screen rather than only
// the console — nobody has devtools open on a phone.
// Marked non-specific: these fire before the code that issued the request can
// report what it was actually loading, and that message is the useful one.
window.addEventListener('error', (e) =>
  loading.fail('Unhandled error', e.error ?? e.message, { specific: false })
)
window.addEventListener('unhandledrejection', (e) =>
  loading.fail('Unhandled rejection', e.reason, { specific: false })
)

const mobile = isMobile()
let level = resolveLevel(mobile)
let quality = settingsFor(level, mobile)

const { tuning, overrides } = resolveTuning()

const { renderer, isWebGL2, msaaSamples, resize, setPixelRatio } = createRenderer(canvas, quality)
const { scene, setGridFade, setShadows } = createScene(quality)
const view = createFirstPersonCamera(tuning)
const camera = view.camera

const overlay = createDebugOverlay({
  renderer,
  isWebGL2,
  msaaSamples,
  quality,
  onCycleQuality: () => applyQuality(nextLevel(level), true),
})
const debug = overlay.debug

resize(camera)
window.addEventListener('resize', () => resize(camera))

const autoScaler = createAutoScaler({
  mobile,
  getP95: () => debug.frameTimes().p95,
  getLevel: () => level,
  onDowngrade: (next) => applyQuality(next, false),
  log: overlay.log,
})

if (isManual()) autoScaler.disable('auto-scaler off (manual preset)')

const overrideNames = Object.keys(overrides)
if (overrideNames.length) {
  debug.tuned = overrideNames
  overlay.log(`tuning overridden: ${overrideNames.join(', ')}`)
}

// Physics is WebAssembly and has to be fetched and instantiated before a
// capsule can exist, so boot is async from here.
loading.step('loading physics…', 0.15)
const physics = await createPhysics().catch((error) => {
  loading.fail('Could not start the physics engine', error)
  throw error
})

loading.step('building world…', 0.3)
const blockout = createBlockout(tuning)
scene.add(blockout.group)
for (const box of blockout.colliders) physics.addStaticBox(box)

// The ground plane is visual only; it needs its own collider to stand on.
physics.addStaticBox({
  half: { x: 200, y: 0.5, z: 200 },
  position: { x: 0, y: -0.5, z: 0 },
})

const input = createInput(canvas, tuning)
const player = createPlayer({
  physics,
  tuning,
  spawn: resolveSpawn({ x: 0, y: tuning.SPAWN_HEIGHT, z: 8 }),
})

// --- stress test (§5.1) ---------------------------------------------------
// ?stress=8 spawns characters with PBR materials under an HDRI, so the budget
// can be measured against the honest worst case instead of guessed at.
const assets = createAssets(renderer)
const stressCount = Number(new URLSearchParams(location.search).get('stress') || 0)
/** @type {{ update: (dt: number) => void }|null} */
let stress = null

if (stressCount > 0) {
  loading.step('loading lighting…', 0.45)
  const environment = await assets
    .loadEnvironment('assets/hdri/sky_1k.hdr')
    .catch((error) => {
      loading.fail('Could not load the environment map (assets/hdri/sky_1k.hdr)', error)
      throw error
    })
  scene.environment = environment

  loading.step(`loading ${stressCount} characters…`, 0.6)
  stress = await createStressScene({ scene, assets, count: stressCount }).catch((error) => {
    loading.fail('Could not load character models', error)
    throw error
  })

  const memory = measureTextureMemory(scene)
  debug.textureBytes = memory.bytes
  debug.textureCount = memory.textures
  debug.textureBreakdown = memory.breakdown
  overlay.log(
    `stress ${stressCount}: ${(memory.bytes / 1048576).toFixed(1)} MB textures ` +
      `(${memory.compressed} ktx2, ${memory.uncompressed} raw)`
  )
  // KTX2 transcodes to whatever the device supports, so the same asset costs
  // different amounts on different GPUs. Naming the format makes that visible
  // instead of leaving an unexplained number.
  const biggest = memory.breakdown[0]
  if (biggest) overlay.log(`largest: ${biggest.name} ${biggest.detail}`)
  const sample = memory.breakdown.find((t) => t.detail.includes('B/px'))
  if (sample) overlay.log(`transcode: ${sample.detail}`)
}

/**
 * Switch preset.
 *
 * A manual choice reloads straight away when MSAA differs — the player asked
 * for it and expects to see it. An automatic downgrade must not yank the page
 * out from under them, so it applies everything that can change live and leaves
 * the MSAA part for the next load.
 *
 * @param {'low'|'medium'|'high'} next
 * @param {boolean} manual
 */
function applyQuality(next, manual) {
  const settings = settingsFor(next, mobile)
  storeLevel(next)

  if (manual) {
    setManual()
    autoScaler.disable('auto-scaler off (manual preset)')

    if (requiresReload(quality, settings)) {
      // The ?q= pin outranks the stored preset, so a plain reload would land
      // back on the preset we just left. Carry the new choice in the URL.
      const url = new URL(location.href)
      url.searchParams.set('q', next)
      location.replace(url)
      return
    }
  }

  const msaaDeferred = requiresReload(quality, settings)

  level = next
  quality = settings
  setPixelRatio(settings.pixelRatio, camera)
  setGridFade(settings.gridFadeStart, settings.gridFadeEnd)
  setShadows(settings.shadows)

  renderer.shadowMap.enabled = settings.shadows
  debug.quality = next
  debug.shadows = settings.shadows

  if (msaaDeferred) overlay.log(`msaa change applies on next load`)
}

startLoop({
  fixedStep(dt) {
    debug.simSteps++
    player.fixedStep(input.sample(), dt)
  },

  render(dt, alpha) {
    stress?.update(dt)

    view.update({
      position: player.interpolatedPosition(alpha),
      yaw: input.yaw,
      pitch: input.pitch,
      crouching: player.state.crouching,
      dt,
    })

    renderer.render(scene, camera)

    // Pixel readback has to happen here, right after the draw call, while the
    // drawing buffer still holds this frame.
    if (debug.pixelSampleRequested) {
      debug.pixelSampleRequested = false
      debug.pixelSample = { ...samplePixels(renderer), frame: debug.frame }
    }

    debug.player = {
      x: player.state.pos.x,
      y: player.state.pos.y,
      z: player.state.pos.z,
      speed: player.speed,
      onGround: player.state.onGround,
      crouching: player.state.crouching,
      locked: input.locked,
      buttons: input.buttons,
    }

    overlay.update()
    autoScaler.update(dt * 1000)

    if (!debug.ready) {
      // Set only after a frame has really been drawn. `load` fires long before
      // WebGL has put anything on screen, so the harness waits on this instead.
      // The loading screen is dismissed here for the same reason: the first
      // real frame exists, so hiding it cannot reveal a black canvas.
      debug.ready = true
      window.__CEDAR_READY__ = true
      loading.done()
    }
  },
})
