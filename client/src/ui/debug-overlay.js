import { Vector2 } from 'three'
import { TICK_HZ, BUDGET, KEYMAP, UI_KEYS } from '../../../shared/constants.js'
import { isMobile } from '../core/renderer.js'

/** Frame times kept for percentile reporting — 4 seconds at 60 fps. */
const FRAME_HISTORY = 240

/** Strip the noise off KeyboardEvent.code for display: "KeyC" -> "C". */
const shortName = (code) => code.replace(/^(Key|Digit)/, '').replace(/^Arrow/, '')

/**
 * Active bindings, read from the single source in shared/constants.js so the
 * overlay can never drift from what the input handler actually does.
 */
const BINDING_LINES = [
  ...Object.entries(KEYMAP).map(
    ([action, codes]) => `  ${action.toLowerCase().padEnd(8)} ${codes.map(shortName).join(' / ')}`
  ),
  ...Object.entries(UI_KEYS).map(
    ([action, code]) => `  ${action.toLowerCase().replace(/_/g, ' ').padEnd(8)} ${shortName(code)}`
  ),
]
/** Recent events shown at the bottom of the overlay. */
const LOG_LIMIT = 4

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

  // Visible in dev, and in any build when ?debug=1 is present. A phone has no
  // F3 key, so the URL is the only way in before the toggle button is tapped.
  const forced = new URLSearchParams(location.search).get('debug') === '1'
  el.hidden = !(import.meta.env.DEV || forced)

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
    /** Fixed simulation steps run so far — should advance at TICK_HZ. */
    simSteps: 0,
    simHz: 0,
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

  debug.log = /** @type {string[]} */ ([])

  /**
   * Record an event. Quality switches go through here so a change that happens
   * on its own is visible rather than silent.
   *
   * @param {string} message
   */
  function log(message) {
    debug.log.push(`${(performance.now() / 1000).toFixed(1)}s ${message}`)
    if (debug.log.length > LOG_LIMIT) debug.log.shift()
    if (!el.hidden) render()
  }

  window.__CEDAR_DEBUG__ = debug

  /** @type {{ setOverlayVisible: (visible: boolean) => void } | null} */
  let touchUi = null

  /** Show or hide, redrawing on show so it never appears blank or stale. */
  function toggle() {
    el.hidden = !el.hidden
    if (!el.hidden) render()
    touchUi?.setOverlayVisible(!el.hidden)
  }

  let bindingsVisible = false

  window.addEventListener('keydown', (e) => {
    // Auto-repeat would flip these on and off for as long as the key is held.
    if (e.repeat) return
    if (e.code === UI_KEYS.TOGGLE_OVERLAY) {
      e.preventDefault()
      toggle()
    }
    if (e.code === UI_KEYS.CYCLE_QUALITY) {
      e.preventDefault()
      onCycleQuality()
    }
    if (e.code === 'F1') {
      e.preventDefault()
      bindingsVisible = !bindingsVisible
      if (!el.hidden) render()
    }
  })

  if (navigator.maxTouchPoints > 0) {
    touchUi = createTouchToggle(toggle, onCycleQuality)
    touchUi.setOverlayVisible(!el.hidden)

    // Three-finger tap, for when the button is in the way. touchstart fires
    // once per finger added, so the third one triggers it exactly once; the
    // cooldown guards against a sloppy grip firing it twice.
    // Negative infinity, not 0: performance.now() starts near zero, so a zero
    // seed makes the cooldown swallow any gesture in the first 600 ms.
    let lastGesture = Number.NEGATIVE_INFINITY
    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 3) return
        const now = performance.now()
        if (now - lastGesture < 600) return
        lastGesture = now
        toggle()
      },
      { passive: true }
    )
  }

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
  let lastSimSteps = 0

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
      // A sim rate that is not TICK_HZ means the simulation is running at the
      // wrong speed, which no amount of correct movement maths can fix.
      debug.simHz = Math.round(((debug.simSteps - lastSimSteps) * 1000) / elapsedMs)
      lastSimSteps = debug.simSteps
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
      ...(debug.textureBytes
        ? [`vram  ${(debug.textureBytes / 1048576).toFixed(1)} MB textures`]
        : []),
      `res   ${debug.width}x${debug.height} @${debug.pixelRatio}`,
      `sim   ${debug.simHz} Hz  (target ${debug.tickHz})`,
      `net   ping ${debug.ping ?? '—'}`,
      `gl    ${debug.webgl2 ? 'WebGL2' : 'NO WEBGL2'}`,
      ...(debug.player
        ? [
            `pos   ${debug.player.x.toFixed(1)} ${debug.player.y.toFixed(1)} ${debug.player.z.toFixed(1)}`,
            `spd   ${debug.player.speed.toFixed(2)} m/s  ${debug.player.onGround ? 'ground' : 'air'}${debug.player.crouching ? '  crouch' : ''}`,
            `look  ${debug.player.locked ? 'locked' : 'click to lock'}`,
          ]
        : []),
      ...(debug.tuned ? [`tune  ${debug.tuned.join(' ')}`] : []),
      `qual  ${debug.quality.toUpperCase()}`,
      `      msaa ${debug.msaa ? `${debug.msaaSamples}x` : 'off'}  shadow ${debug.shadows ? 'on' : 'off'}`,
      navigator.maxTouchPoints > 0 ? `[DBG] overlay  [QUAL] quality` : `[F3] overlay   [F4] quality`,
      ...(bindingsVisible ? ['', ...BINDING_LINES] : ['[F1] bindings']),
      ...(debug.log.length ? ['', ...debug.log] : []),
    ].join('\n')
  }

  return { update, debug, element: el, log }
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

/**
 * Touch equivalents of F3 and F4, created only on devices that have a
 * touchscreen so they never clutter a desktop screen.
 *
 * The quality button only appears while the overlay is open — cycling presets
 * without being able to read the numbers is pointless.
 *
 * @param {() => void} onToggle
 * @param {() => void} onCycleQuality
 */
function createTouchToggle(onToggle, onCycleQuality) {
  const debugButton = document.createElement('button')
  debugButton.id = 'debug-toggle'
  debugButton.type = 'button'
  debugButton.textContent = 'DBG'
  debugButton.setAttribute('aria-label', 'Toggle debug overlay')
  debugButton.addEventListener('click', onToggle)

  const qualityButton = document.createElement('button')
  qualityButton.id = 'quality-toggle'
  qualityButton.type = 'button'
  qualityButton.textContent = 'QUAL'
  qualityButton.hidden = true
  qualityButton.setAttribute('aria-label', 'Cycle quality preset')
  qualityButton.addEventListener('click', onCycleQuality)

  document.body.append(debugButton, qualityButton)

  return {
    /** @param {boolean} visible */
    setOverlayVisible(visible) {
      qualityButton.hidden = !visible
    },
  }
}
