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

/** Device pixel ratio caps (CLAUDE.md §5). */
export const PIXEL_RATIO_MAX_DESKTOP = 1.5
export const PIXEL_RATIO_MAX_MOBILE = 1.0

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
