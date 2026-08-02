import { createRenderer, samplePixels, isMobile } from './core/renderer.js'
import { startLoop } from './core/loop.js'
import { createScene } from './game/scene.js'
import { createDebugOverlay } from './ui/debug-overlay.js'
import {
  resolveLevel,
  settingsFor,
  storeLevel,
  nextLevel,
  requiresReload,
} from './core/quality.js'

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'))

const mobile = isMobile()
let level = resolveLevel(mobile)
const quality = settingsFor(level, mobile)

const { renderer, isWebGL2, msaaSamples, resize, setPixelRatio } = createRenderer(canvas, quality)
const { scene, camera, update, setGridFade } = createScene(quality)

const overlay = createDebugOverlay({
  renderer,
  isWebGL2,
  msaaSamples,
  quality,
  onCycleQuality: () => applyQuality(nextLevel(level)),
})
const debug = overlay.debug

resize(camera)
window.addEventListener('resize', () => resize(camera))

/**
 * Switch preset. Pixel ratio and grid fade are live; MSAA and shadows are baked
 * into the WebGL context and the compiled materials, so those need a reload.
 *
 * @param {'low'|'medium'|'high'} next
 */
function applyQuality(next) {
  const settings = settingsFor(next, mobile)
  storeLevel(next)

  if (requiresReload(quality, settings)) {
    // The ?q= pin outranks the stored preset, so a plain reload would land back
    // on the preset we just left. Carry the new choice in the URL instead.
    const url = new URL(location.href)
    url.searchParams.set('q', next)
    location.replace(url)
    return
  }

  level = next
  setPixelRatio(settings.pixelRatio, camera)
  setGridFade(settings.gridFadeStart, settings.gridFadeEnd)
  debug.quality = next
}

startLoop((dt) => {
  update(dt)
  renderer.render(scene, camera)

  // Pixel readback has to happen here, right after the draw call, while the
  // drawing buffer still holds this frame.
  if (debug.pixelSampleRequested) {
    debug.pixelSampleRequested = false
    debug.pixelSample = { ...samplePixels(renderer), frame: debug.frame }
  }

  overlay.update()

  if (!debug.ready) {
    // Set only after a frame has really been drawn. `load` fires long before
    // WebGL has put anything on screen, so the harness waits on this instead.
    debug.ready = true
    window.__CEDAR_READY__ = true
  }
})
