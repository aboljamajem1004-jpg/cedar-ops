/**
 * Boot progress and failure display.
 *
 * The markup is static in index.html so it paints before any JavaScript parses.
 * On a phone over a slow connection the WASM and models take seconds, and a
 * black screen with a zeroed overlay is indistinguishable from a broken build —
 * which is exactly how it was reported.
 *
 * Failures are shown on screen rather than only in the console, because nobody
 * has devtools open on a phone.
 */
export function createLoadingScreen() {
  const root = document.getElementById('loading')
  const status = document.getElementById('loading-status')
  const fill = document.getElementById('loading-fill')
  const errorBox = document.getElementById('loading-error')

  let failed = false
  let failureIsSpecific = false

  /**
   * @param {string} message
   * @param {number} progress 0..1
   */
  function step(message, progress) {
    if (failed || !root) return
    if (status) status.textContent = message
    if (fill) fill.style.width = `${Math.round(progress * 100)}%`
  }

  /**
   * Show a failure and stop. Deliberately sticky: a half-loaded game that looks
   * playable is worse than an obvious error.
   *
   * A named failure may replace an anonymous one, but never the reverse. The
   * global error handlers fire first and only know "Failed to fetch", while the
   * caller that actually issued the request knows it was the character model —
   * and that is the message worth showing.
   *
   * @param {string} context what was being attempted
   * @param {unknown} error
   * @param {{ specific?: boolean }} [options]
   */
  function fail(context, error, options = {}) {
    const specific = options.specific !== false
    if (failed && (failureIsSpecific || !specific)) return

    failed = true
    failureIsSpecific = specific
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[cedar] ${context}:`, error)

    if (!root) return
    root.hidden = false
    root.classList.remove('done')
    if (status) status.textContent = 'failed to start'
    if (fill) fill.style.width = '100%'
    if (errorBox) {
      errorBox.hidden = false
      errorBox.textContent = `${context}\n\n${detail}\n\nReload to try again.`
    }
  }

  function done() {
    if (failed || !root) return
    step('ready', 1)
    root.classList.add('done')
    // Removed only after the fade, so the canvas is never covered by a
    // transparent element that still swallows the first tap.
    setTimeout(() => {
      if (!failed) root.hidden = true
    }, 320)
  }

  return { step, fail, done, get failed() { return failed } }
}
