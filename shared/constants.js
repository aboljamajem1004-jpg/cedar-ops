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

// --- input ------------------------------------------------------------------

/** Button bitmask sent with every input. Keep values stable — they go on the wire. */
export const BTN = {
  FORWARD: 1 << 0,
  BACK: 1 << 1,
  LEFT: 1 << 2,
  RIGHT: 1 << 3,
  JUMP: 1 << 4,
  SPRINT: 1 << 5,
  CROUCH: 1 << 6,
}

// --- movement tuning --------------------------------------------------------

/**
 * Every number that decides how movement feels. This is the file to edit.
 *
 * Tuned for snappy/arcade: near-instant start and stop. That is a netcode
 * decision as much as a feel one — momentum makes a mis-prediction take longer
 * to converge, and at ~100 ms ping that shows up as visible sliding.
 *
 * In dev (or with ?tune=1) every key here is overridable from the URL, so these
 * can be tuned live without a rebuild. See client/src/core/tuning.js.
 *
 * Units: metres, seconds, radians unless the name says otherwise.
 */
export const MOVEMENT = {
  SPEED_WALK: 6.5, // top ground speed, m/s — CS-like, roughly 250 units/s
  SPEED_SPRINT: 9.0, // top speed while sprint is held, m/s
  SPEED_CROUCH: 3.2, // top speed while crouched, m/s
  ACCEL_GROUND: 90, // how fast ground speed is reached, m/s² — high means snappy
  FRICTION_GROUND: 70, // deceleration with no input on ground, m/s² — high means instant stop
  ACCEL_AIR: 22, // acceleration available in the air, m/s²
  AIR_CONTROL: 0.35, // fraction of steering authority kept in the air, 0 = none, 1 = full
  AIR_SPEED_CAP: 2.5, // most speed air steering can add in the wish direction, m/s — this is what keeps a jump adjustable instead of flyable
  GRAVITY: 24, // downward acceleration, m/s² — above 9.81 so jumps feel crisp, not floaty
  JUMP_HEIGHT: 1.1, // apex height of a standing jump, m — velocity is derived from this
  MAX_FALL_SPEED: 55, // terminal velocity, m/s
  STEP_HEIGHT: 0.4, // tallest ledge walked over without jumping, m
  SLOPE_LIMIT_DEG: 50, // steepest walkable slope, degrees — steeper than this slides
  PLAYER_HEIGHT: 1.8, // standing capsule height, m
  PLAYER_CROUCH_HEIGHT: 1.2, // crouched capsule height, m
  PLAYER_RADIUS: 0.35, // capsule radius, m
  EYE_HEIGHT: 1.65, // camera height above the feet when standing, m
  EYE_HEIGHT_CROUCH: 1.05, // camera height above the feet when crouched, m
  CROUCH_LERP: 14, // how fast the eye moves between stand and crouch, per second
  MOUSE_SENSITIVITY: 0.0022, // radians of yaw per pixel of mouse movement
  PITCH_LIMIT_DEG: 89, // how far up or down the camera can look, degrees
  SPAWN_HEIGHT: 1.0, // height above ground the player spawns at, m
  GROUND_STICK: 2.0, // downward pull while grounded, m/s — keeps the capsule on slopes and stairs
}

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

/**
 * Most simulation steps run in one rendered frame. Beyond this the backlog is
 * dropped: catching up costs time, which makes the next frame later, which
 * grows the backlog — the classic spiral of death.
 */
export const MAX_STEPS_PER_FRAME = 5

/**
 * Performance budget (CLAUDE.md §5).
 *
 * Revised upward for triangles and downward in emphasis: triangles are sixth on
 * the list of what actually costs frames, behind draw calls, fill rate, texture
 * bandwidth, post passes and shadow passes. These are still ESTIMATES until the
 * Phase 2 stress test replaces them with real device numbers.
 */
export const BUDGET = {
  desktop: { fps: 60, drawCalls: 300, triangles: 1_000_000, textureBytes: 400 * 1024 * 1024 },
  mobile: { fps: 30, drawCalls: 150, triangles: 400_000, textureBytes: 200 * 1024 * 1024 },
}
