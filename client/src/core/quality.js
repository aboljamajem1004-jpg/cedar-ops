import {
  QUALITY,
  QUALITY_LEVELS,
  DEFAULT_QUALITY,
  PIXEL_RATIO_MAX_DESKTOP,
  PIXEL_RATIO_MAX_MOBILE,
} from '../../../shared/constants.js'

const STORAGE_KEY = 'cedar.quality'

/**
 * Settings that are fixed when the WebGL context is created or when materials
 * are compiled. Changing one of these needs a reload; everything else is live.
 */
const NEEDS_RELOAD = ['msaa', 'shadows']

/**
 * Resolve the active preset: ?q= in the URL wins, then the stored choice, then
 * the device default. The URL form exists so the benchmark can pin a preset
 * without touching stored state.
 *
 * @param {boolean} mobile
 * @returns {'low'|'medium'|'high'}
 */
export function resolveLevel(mobile) {
  const fromUrl = new URLSearchParams(location.search).get('q')
  if (fromUrl && QUALITY_LEVELS.includes(fromUrl)) return fromUrl

  const stored = read(STORAGE_KEY)
  if (stored && QUALITY_LEVELS.includes(stored)) return stored

  return mobile ? DEFAULT_QUALITY.mobile : DEFAULT_QUALITY.desktop
}

/**
 * Settings for a preset, with the device ceiling applied and per-setting URL
 * overrides on top.
 *
 * The overrides exist to measure one change at a time — `?pr=1&msaa=0&grid=0`
 * isolates a single variable, which the three presets cannot do because they
 * move several at once.
 *
 * @param {'low'|'medium'|'high'} level
 * @param {boolean} mobile
 */
export function settingsFor(level, mobile) {
  const preset = QUALITY[level]
  const ceiling = mobile ? PIXEL_RATIO_MAX_MOBILE : PIXEL_RATIO_MAX_DESKTOP

  const settings = {
    level,
    pixelRatio: Math.min(preset.pixelRatio, ceiling),
    msaa: preset.msaa,
    shadows: preset.shadows,
    grid: true,
    gridFadeStart: preset.gridFadeStart,
    gridFadeEnd: preset.gridFadeEnd,
  }

  const params = new URLSearchParams(location.search)
  const pr = Number(params.get('pr'))
  if (Number.isFinite(pr) && pr > 0) settings.pixelRatio = Math.min(pr, ceiling)
  if (params.has('msaa')) settings.msaa = params.get('msaa') === '1'
  if (params.has('shadows')) settings.shadows = params.get('shadows') === '1'
  if (params.has('grid')) settings.grid = params.get('grid') === '1'

  return settings
}

/** @param {'low'|'medium'|'high'} level */
export function storeLevel(level) {
  try {
    localStorage.setItem(STORAGE_KEY, level)
  } catch {
    // Private browsing or blocked storage. The setting just will not persist.
  }
}

/**
 * Next preset in the cycle, wrapping around.
 * @param {'low'|'medium'|'high'} level
 */
export function nextLevel(level) {
  const i = QUALITY_LEVELS.indexOf(level)
  return QUALITY_LEVELS[(i + 1) % QUALITY_LEVELS.length]
}

/**
 * True when moving between these two presets changes something that only takes
 * effect at context or material creation time.
 *
 * @param {ReturnType<typeof settingsFor>} a
 * @param {ReturnType<typeof settingsFor>} b
 */
export function requiresReload(a, b) {
  return NEEDS_RELOAD.some((key) => a[key] !== b[key])
}

/** @param {string} key */
function read(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
