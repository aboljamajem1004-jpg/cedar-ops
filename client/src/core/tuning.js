import { MOVEMENT } from '../../../shared/constants.js'

/**
 * Movement tuning with URL overrides, so numbers can be changed live without a
 * rebuild: `?SPEED_WALK=8&JUMP_HEIGHT=1.4`. Keys are the names in MOVEMENT,
 * matched case-insensitively.
 *
 * Enabled in dev builds always. In a production build it needs an explicit
 * ?tune=1, so a deployed URL cannot be turned into a speed hack by accident.
 * From Phase 5 the server owns movement and validates it anyway, but there is
 * no reason to ship the footgun before then.
 *
 * @returns {{ tuning: typeof MOVEMENT, overrides: Record<string, number>, enabled: boolean }}
 */
export function resolveTuning() {
  const params = new URLSearchParams(location.search)
  const enabled = import.meta.env.DEV || params.get('tune') === '1'

  const tuning = { ...MOVEMENT }
  /** @type {Record<string, number>} */
  const overrides = {}

  if (!enabled) return { tuning, overrides, enabled }

  const byLowerCase = new Map(Object.keys(MOVEMENT).map((key) => [key.toLowerCase(), key]))

  for (const [rawKey, rawValue] of params) {
    const key = byLowerCase.get(rawKey.toLowerCase())
    if (!key) continue

    const value = Number(rawValue)
    if (!Number.isFinite(value)) continue

    tuning[key] = value
    overrides[key] = value
  }

  return { tuning, overrides, enabled }
}

/**
 * Spawn position override: `?spawn=9,1,-4`.
 *
 * Same gate as the tuning overrides — dev builds, or an explicit ?tune=1.
 * Useful for testing one corner of a map without walking there, and it keeps
 * the movement tests from spending their entire timeout crossing open ground.
 *
 * @param {{x: number, y: number, z: number}} fallback
 */
export function resolveSpawn(fallback) {
  const params = new URLSearchParams(location.search)
  const enabled = import.meta.env.DEV || params.get('tune') === '1'
  const raw = params.get('spawn')
  if (!enabled || !raw) return fallback

  const parts = raw.split(',').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return fallback

  return { x: parts[0], y: parts[1], z: parts[2] }
}
