import { AUTOSCALE, QUALITY_LEVELS } from '../../../shared/constants.js'

/**
 * Steps the quality preset down when frame time stays bad for long enough.
 *
 * It watches p95, not average frame time. An average hides exactly the problem
 * worth reacting to: a stream of occasional long frames reads as fine on
 * average but feels like stutter.
 *
 * It never steps back up. Raising quality raises frame time, which would trip
 * the downgrade, which would raise it again — a loop that never settles.
 * Recovering is the player's call, through the quality button.
 *
 * @param {{ mobile: boolean, getP95: () => number, getLevel: () => string,
 *           onDowngrade: (next: string) => void, log: (message: string) => void }} opts
 */
export function createAutoScaler({ mobile, getP95, getLevel, onDowngrade, log }) {
  const budget = mobile ? AUTOSCALE.p95BudgetMs.mobile : AUTOSCALE.p95BudgetMs.desktop

  let enabled = true
  let elapsed = 0
  let sinceCheck = 0
  let breach = 0
  /** @type {number|null} */
  let lastChange = null

  /** @param {number} dtMs */
  function update(dtMs) {
    if (!enabled) return

    elapsed += dtMs
    // Early frames are dominated by shader compilation and asset upload. Acting
    // on them would downgrade every device on every load.
    if (elapsed < AUTOSCALE.graceMs) return
    if (lastChange !== null && elapsed - lastChange < AUTOSCALE.cooldownMs) return

    sinceCheck += dtMs
    if (sinceCheck < AUTOSCALE.checkIntervalMs) return
    sinceCheck = 0

    const p95 = getP95()
    if (p95 <= 0) return

    if (p95 <= budget) {
      breach = 0
      return
    }

    breach += AUTOSCALE.checkIntervalMs
    if (breach < AUTOSCALE.sustainedMs) return

    const level = getLevel()
    const index = QUALITY_LEVELS.indexOf(level)
    if (index <= 0) {
      // Already at the bottom. Nothing further to give, so stop checking.
      enabled = false
      log(`auto: at ${level}, cannot go lower (p95 ${p95.toFixed(1)}ms)`)
      return
    }

    const next = QUALITY_LEVELS[index - 1]
    log(`auto: ${level} -> ${next} (p95 ${p95.toFixed(1)}ms > ${budget}ms)`)
    breach = 0
    lastChange = elapsed
    onDowngrade(next)
  }

  /** @param {string} reason */
  function disable(reason) {
    if (!enabled) return
    enabled = false
    log(reason)
  }

  return {
    update,
    disable,
    get enabled() {
      return enabled
    },
  }
}
