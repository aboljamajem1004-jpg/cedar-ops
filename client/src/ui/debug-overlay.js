import { Vector2 } from 'three'
import { TICK_HZ, BUDGET } from '../../../shared/constants.js'
import { isMobile } from '../core/renderer.js'

/** Frame times kept for percentile reporting — 4 seconds at 60 fps. */
const FRAME_HISTORY = 240

/**
 * F3 debug overlay. F4 cycles the quality preset.
 *
 * Everything shown here is also written to `window.__CEDAR_DEBUG__` each frame,
 * so the Playwright harness reads numbers straight off that object instead of
 * scraping text out of the DOM.
 *
 * @param {{ renderer: import('three').WebGLRenderer, isWebGL2: boolean,
 *           msaaSamples: number, quality: any, onCycleQuality: () => void }} opts
 */
export function createDebugOverlay({ renderer, isWebGL2, msaaSamples, quality, onCycleQuality }) {
  const el = document.getElementById('debug-overlay') ?? createElement()
  el.hidden = !import.meta.env.DEV

  const budget = isMobile() ? BUDGET.mobile : BUDGET.desktop

  const debug = {
    fps: 0,
    fpsMin: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    /** @type {number|null} filled in from Phase 4 */
    ping: null,
    width: 0,
    height: 0,
    pixelRatio: renderer.getPixelRatio(),
    webgl2: isWebGL2,
    /** Read from shared/constants.js — proves the cross-root import resolved. */
    tickHz: TICK_HZ,
    frame: 0,
    ready: false,
    quality: quality.level,
    msaa: quality.msaa,
    msaaSamples,
    shadows: quality.shadows,
    grid: quality.grid,
    /** Median and 95th percentile frame time over the ring buffer, in ms. */
    frameTimes() {
      const sorted = history.filter((v) => v > 0).sort((a, b) => a - b)
      if (!sorted.length) return { median: 0, p95: 0, samples: 0 }
      return {
        median: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        samples: sorted.length,
      }
    },
    /** @type {{mean:number,min:number,max:number,pixels:number,frame:number}|null} */
    pixelSample: null,
    pixelSampleRequested: false,
    requestPixelSample() {
      debug.pixelSample = null
      debug.pixelSampleRequested = true
    },
  }

  window.__CEDAR_DEBUG__ = debug

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault()
      el.hidden = !el.hidden
      if (!el.hidden) render()
    }
    if (e.code === 'F4') {
      e.preventDefault()
      onCycleQuality()
    }
  })

  const history = new Array(FRAME_HISTORY).fill(0)
  let historyIndex = 0

  // Rolling 1-second window. Average FPS hides stutter, so the worst frame in
  // the window is reported next to it — that is the number you actually feel.
  //
  // This measures wall-clock time, deliberately NOT the loop's dt. dt is capped
  // at MAX_FRAME_DT so the simulation never takes an enormous step; feeding that
  // capped value in here would make the window close late and under-report FPS
  // exactly when frames are slowest.
  let frames = 0
  let elapsedMs = 0
  let worstMs = 0
  let lastNow = performance.now()

  function update() {
    const info = renderer.info.render
    const size = renderer.getDrawingBufferSize(_size)

    const now = performance.now()
    const wallMs = now - lastNow
    lastNow = now

    debug.frame++
    debug.frameMs = wallMs
    history[historyIndex] = wallMs
    historyIndex = (historyIndex + 1) % FRAME_HISTORY
    debug.drawCalls = info.calls
    debug.triangles = info.triangles
    debug.geometries = renderer.info.memory.geometries
    debug.textures = renderer.info.memory.textures
    debug.width = size.x
    debug.height = size.y
    debug.pixelRatio = renderer.getPixelRatio()

    frames++
    elapsedMs += wallMs
    worstMs = Math.max(worstMs, wallMs)

    if (elapsedMs >= 1000) {
      debug.fps = Math.round((frames * 1000) / elapsedMs)
      debug.fpsMin = Math.round(1000 / worstMs)
      frames = 0
      elapsedMs = 0
      worstMs = 0
      if (!el.hidden) render()
    }
  }

  function render() {
    const over = debug.drawCalls > budget.drawCalls || debug.triangles > budget.triangles
    el.style.color = over ? '#ffb4a2' : '#9ef5b0'
    const t = debug.frameTimes()
    el.textContent = [
      `fps   ${pad(debug.fps)}  (low ${debug.fpsMin})`,
      `frame p50 ${t.median.toFixed(1)}  p95 ${t.p95.toFixed(1)} ms`,
      `draws ${pad(debug.drawCalls)}  / ${budget.drawCalls}`,
      `tris  ${pad(debug.triangles)}  / ${budget.triangles}`,
      `mem   ${debug.geometries} geo  ${debug.textures} tex`,
      `res   ${debug.width}x${debug.height} @${debug.pixelRatio}`,
      `net   ping ${debug.ping ?? '—'}  tick ${debug.tickHz}Hz`,
      `gl    ${debug.webgl2 ? 'WebGL2' : 'NO WEBGL2'}`,
      `qual  ${debug.quality.toUpperCase()}`,
      `      msaa ${debug.msaa ? `${debug.msaaSamples}x` : 'off'}  shadow ${debug.shadows ? 'on' : 'off'}`,
      `[F3] overlay   [F4] quality`,
    ].join('\n')
  }

  return { update, debug, element: el }
}

const _size = new Vector2()

/** @param {number} n */
function pad(n) {
  return String(n).padStart(6, ' ')
}

function createElement() {
  const el = document.createElement('div')
  el.id = 'debug-overlay'
  document.body.appendChild(el)
  return el
}
