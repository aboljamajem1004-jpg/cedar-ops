/**
 * Constants shared by client and server.
 *
 * This file lives outside client/ on purpose: the server imports it with plain
 * Node ESM, the client imports it through Vite. Both use relative paths, so no
 * bundler alias is required on either side. See client/vite.config.js for the
 * `server.fs.allow` entry that lets the dev server read outside its root.
 */

// --- netcode (see CLAUDE.md §4) ---------------------------------------------

/** Fixed simulation rate, both sides. */
export const TICK_HZ = 30
/** Milliseconds per simulation tick. */
export const TICK_MS = 1000 / TICK_HZ
/** Server -> client snapshot rate. */
export const SNAPSHOT_HZ = 20
/** How far in the past remote players are rendered, in milliseconds. */
export const INTERP_DELAY_MS = 100
/** Hitbox history kept on the server for lag compensation, in milliseconds. */
export const LAGCOMP_HISTORY_MS = 1000
/** Hard cap on players per room. */
export const MAX_PLAYERS = 8

// --- world ------------------------------------------------------------------

/** Map is MAP_SIZE x MAP_SIZE metres. */
export const MAP_SIZE = 200

// --- rendering --------------------------------------------------------------

/**
 * Absolute device pixel ratio ceilings (CLAUDE.md §5).
 *
 * Mobile was raised from 1.0 to 1.25: at 1.0 the grid lines aliased badly on a
 * high-DPI phone. 1.25 is the compromise being trialled — fill cost scales with
 * the square of this number, so 1.25 costs ~56% more fragments than 1.0.
 */
export const PIXEL_RATIO_MAX_DESKTOP = 1.5
export const PIXEL_RATIO_MAX_MOBILE = 1.25
/** Ratio used by the low preset on any device. */
export const PIXEL_RATIO_LOW = 1.0

/**
 * Quality presets. `msaa` and `shadows` are baked into the WebGL context and
 * the compiled materials, so changing either needs a page reload; pixel ratio
 * and the grid fade distances apply live.
 */
export const QUALITY_LEVELS = /** @type {const} */ (['low', 'medium', 'high'])

export const QUALITY = {
  low: {
    pixelRatio: PIXEL_RATIO_LOW,
    msaa: false,
    shadows: false,
    gridFadeStart: 25,
    gridFadeEnd: 60,
  },
  medium: {
    pixelRatio: PIXEL_RATIO_MAX_MOBILE,
    msaa: true,
    shadows: false,
    gridFadeStart: 40,
    gridFadeEnd: 95,
  },
  high: {
    pixelRatio: PIXEL_RATIO_MAX_DESKTOP,
    msaa: true,
    shadows: true,
    gridFadeStart: 60,
    gridFadeEnd: 150,
  },
}

/**
 * Starting preset per device class.
 *
 * Mobile is 'high': on a 60 Hz phone all three presets sit on the vsync
 * interval with this scene, so there is no measured reason to ship a lower one,
 * and high looks clearly better. The auto-scaler below exists because that
 * headroom is unknown and will shrink as the map and players arrive.
 */
export const DEFAULT_QUALITY = { desktop: 'high', mobile: 'high' }

/**
 * Automatic downscaling.
 *
 * Only ever steps DOWN. An auto-upgrade would oscillate: raising quality
 * increases frame time, which trips the downgrade, which raises it again.
 * Recovering is the player's call, through the quality button.
 *
 * The thresholds sit well below each target rather than at it. A device that is
 * merely vsync-locked at its target must never trip the scaler — 45 ms is about
 * 22 fps, unambiguously below the 30 fps mobile target, and 28 ms is about
 * 36 fps against a 60 fps desktop target.
 */
export const AUTOSCALE = {
  /** Sustained p95 frame time that counts as struggling, in ms. */
  p95BudgetMs: { desktop: 28, mobile: 45 },
  /** How long the breach must persist before acting. */
  sustainedMs: 3000,
  /** Ignored after load — shader compilation makes early frames meaningless. */
  graceMs: 5000,
  /** Quiet period after a downgrade, so a step is given time to take effect. */
  cooldownMs: 8000,
  /** How often the check runs. */
  checkIntervalMs: 500,
}

/**
 * Largest frame delta we will ever simulate, in seconds. Without this, a tab
 * that was backgrounded for 10 seconds returns one enormous frame and every
 * moving object teleports through walls.
 */
export const MAX_FRAME_DT = 0.1

/** Performance budget, enforced from Phase 0 onward (CLAUDE.md §5). */
export const BUDGET = {
  desktop: { fps: 60, drawCalls: 150, triangles: 300_000 },
  mobile: { fps: 30, drawCalls: 100, triangles: 150_000 },
}
