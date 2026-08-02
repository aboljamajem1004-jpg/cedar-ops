import { MAX_FRAME_DT, TICK_MS, MAX_STEPS_PER_FRAME } from '../../../shared/constants.js'

/**
 * Fixed-timestep loop with interpolated rendering.
 *
 * The simulation must advance in equal steps or it is not deterministic, and a
 * non-deterministic simulation cannot be replayed — which is exactly what
 * client prediction does every time a snapshot arrives in phase 5. Rendering
 * still runs as fast as the display allows, interpolating between the last two
 * simulated states.
 *
 * @param {{ fixedStep: (dt: number) => void,
 *           render: (dt: number, alpha: number) => void }} handlers
 * @returns {{ stop: () => void }}
 */
export function startLoop({ fixedStep, render }) {
  const stepSeconds = TICK_MS / 1000

  let last = performance.now()
  let accumulator = 0
  let running = true
  let handle = 0

  /** @param {number} now */
  function frame(now) {
    if (!running) return
    handle = requestAnimationFrame(frame)

    const dt = Math.min((now - last) / 1000, MAX_FRAME_DT)
    last = now
    accumulator += dt * 1000

    let steps = 0
    while (accumulator >= TICK_MS && steps < MAX_STEPS_PER_FRAME) {
      fixedStep(stepSeconds)
      accumulator -= TICK_MS
      steps++
    }

    // If the machine cannot keep up, drop the backlog instead of trying to
    // catch up forever — each catch-up step makes the next frame later still.
    if (steps === MAX_STEPS_PER_FRAME) accumulator = 0

    render(dt, accumulator / TICK_MS)
  }

  handle = requestAnimationFrame(frame)

  return {
    stop() {
      running = false
      cancelAnimationFrame(handle)
    },
  }
}
