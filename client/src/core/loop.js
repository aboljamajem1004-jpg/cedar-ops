import { MAX_FRAME_DT } from '../../../shared/constants.js'

/**
 * requestAnimationFrame loop with a clamped delta.
 *
 * Phase 0 renders every frame with a variable delta. The fixed 30 Hz simulation
 * step arrives in Phase 1, when there is something to simulate.
 *
 * @param {(dt: number, elapsed: number) => void} onFrame dt and elapsed in seconds
 * @returns {{ stop: () => void }}
 */
export function startLoop(onFrame) {
  let last = performance.now()
  let start = last
  let running = true
  let handle = 0

  /** @param {number} now */
  function frame(now) {
    if (!running) return
    handle = requestAnimationFrame(frame)

    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT)
    last = now
    onFrame(dt, (now - start) / 1000)
  }

  handle = requestAnimationFrame(frame)

  return {
    stop() {
      running = false
      cancelAnimationFrame(handle)
    },
  }
}
