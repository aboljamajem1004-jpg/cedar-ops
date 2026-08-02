import * as THREE from 'three'
import {
  PIXEL_RATIO_MAX_DESKTOP,
  PIXEL_RATIO_MAX_MOBILE,
} from '../../../shared/constants.js'

/**
 * Rough mobile check. Used only to pick render settings, never for gameplay.
 * @returns {boolean}
 */
export function isMobile() {
  if (typeof navigator === 'undefined') return false
  if (navigator.userAgentData?.mobile === true) return true
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

/**
 * Create the WebGL2 renderer and keep it sized to the canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ renderer: THREE.WebGLRenderer, isWebGL2: boolean, resize: (camera: THREE.PerspectiveCamera) => void }}
 */
export function createRenderer(canvas) {
  const mobile = isMobile()

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !mobile,
    powerPreference: 'high-performance',
    stencil: false,
  })

  renderer.outputColorSpace = THREE.SRGBColorSpace
  // One real-time shadow-casting light maximum, and none on mobile (§5).
  renderer.shadowMap.enabled = !mobile
  // PCFSoftShadowMap is deprecated as of three 0.185 and falls back to PCF anyway.
  renderer.shadowMap.type = THREE.PCFShadowMap

  const maxRatio = mobile ? PIXEL_RATIO_MAX_MOBILE : PIXEL_RATIO_MAX_DESKTOP
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio))

  const gl = renderer.getContext()
  const isWebGL2 =
    typeof WebGL2RenderingContext !== 'undefined' &&
    gl instanceof WebGL2RenderingContext

  /** @param {THREE.PerspectiveCamera} camera */
  function resize(camera) {
    const w = canvas.clientWidth || window.innerWidth
    const h = canvas.clientHeight || window.innerHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  return { renderer, isWebGL2, resize }
}

/**
 * Read back a block of pixels from the centre of the drawing buffer.
 *
 * This must run in the same frame as the draw call, before the browser
 * composites and clears the buffer — so the render loop calls it, not the test.
 * It exists to catch a black or empty frame, which is the failure mode a
 * screenshot-free smoke test would otherwise miss. It stalls the GPU pipeline,
 * so it only runs when explicitly requested.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ mean: number, min: number, max: number, pixels: number }}
 */
export function samplePixels(renderer) {
  const gl = renderer.getContext()
  const size = 256
  const w = Math.min(size, gl.drawingBufferWidth)
  const h = Math.min(size, gl.drawingBufferHeight)
  const x = Math.max(0, Math.floor((gl.drawingBufferWidth - w) / 2))
  const y = Math.max(0, Math.floor((gl.drawingBufferHeight - h) / 2))

  const buf = new Uint8Array(w * h * 4)
  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)

  let total = 0
  let min = 255
  let max = 0
  const count = w * h
  for (let i = 0; i < count; i++) {
    const o = i * 4
    // Perceptual-ish luminance is overkill here; a plain mean is enough to tell
    // "something was drawn" from "the frame is black".
    const lum = (buf[o] + buf[o + 1] + buf[o + 2]) / 3
    total += lum
    if (lum < min) min = lum
    if (lum > max) max = lum
  }

  return { mean: total / count, min, max, pixels: count }
}
