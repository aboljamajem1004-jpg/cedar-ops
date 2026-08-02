import { createRenderer, samplePixels } from './core/renderer.js'
import { startLoop } from './core/loop.js'
import { createScene } from './game/scene.js'
import { createDebugOverlay } from './ui/debug-overlay.js'

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'))

const { renderer, isWebGL2, resize } = createRenderer(canvas)
const { scene, camera, update } = createScene()
const overlay = createDebugOverlay({ renderer, isWebGL2 })
const debug = overlay.debug

resize(camera)
window.addEventListener('resize', () => resize(camera))

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
