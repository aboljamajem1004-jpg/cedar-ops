import { test, expect } from '@playwright/test'
import { KEYMAP, UI_KEYS, RESERVED_KEYS, BTN } from '../../shared/constants.js'

/**
 * A binding the browser claims is not a binding — preventDefault is ignored for
 * these, and pointer lock does not help. This suite exists so a reserved key
 * fails here rather than closing someone's tab mid-match.
 */

/** Ctrl, Alt and Meta turn every other key into a browser chord. */
const DANGEROUS_MODIFIERS = ['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']
/** Shift is safe: Shift+letter is just an uppercase letter, not a chord. */
const SAFE_MODIFIERS = ['ShiftLeft', 'ShiftRight']
const MODIFIERS = [...DANGEROUS_MODIFIERS, ...SAFE_MODIFIERS]

/** Single keys the browser or OS takes outright. */
const RESERVED_SINGLE = ['F5', 'F6', 'F11', 'F12', 'Tab', 'Escape']

test('every action has a binding that needs no dangerous modifier', () => {
  for (const [action, codes] of Object.entries(KEYMAP)) {
    const usable = codes.filter((code) => !DANGEROUS_MODIFIERS.includes(code))
    expect(
      usable.length,
      `${action} is only reachable via Ctrl/Alt/Meta — holding one to move makes ` +
        `every other key a browser chord (Ctrl+W closes the tab)`
    ).toBeGreaterThan(0)
  }
})

test('crouch works standalone, so Ctrl+W is never required', () => {
  // The specific failure that prompted this: crouch on Ctrl meant crouch-walk
  // was Ctrl+W, which closes the tab and cannot be intercepted.
  const [primary] = KEYMAP.CROUCH
  expect(MODIFIERS, `crouch's primary binding "${primary}" must not be a modifier`).not.toContain(
    primary
  )
})

test('no binding uses a key the browser reserves', () => {
  const all = [...Object.values(KEYMAP).flat(), ...Object.values(UI_KEYS)]
  for (const code of all) {
    expect(RESERVED_SINGLE, `"${code}" is claimed by the browser or OS`).not.toContain(code)
  }
})

test('no key is bound to two different actions', () => {
  const seen = new Map()
  for (const [action, codes] of Object.entries(KEYMAP)) {
    for (const code of codes) {
      expect(seen.has(code), `"${code}" is bound to both ${seen.get(code)} and ${action}`).toBe(
        false
      )
      seen.set(code, action)
    }
  }
  for (const [name, code] of Object.entries(UI_KEYS)) {
    expect(seen.has(code), `UI key "${code}" (${name}) collides with ${seen.get(code)}`).toBe(false)
    seen.set(code, name)
  }
})

test('every gameplay action maps to a known button bit', () => {
  for (const action of Object.keys(KEYMAP)) {
    expect(BTN[action], `KEYMAP has "${action}" but BTN does not`).toBeGreaterThan(0)
  }
})

test('the reserved list documents why each key is unusable', () => {
  // Documentation is the point of this table — a bare list would not stop
  // anyone re-adding a binding later.
  for (const [key, reason] of Object.entries(RESERVED_KEYS)) {
    expect(reason, `${key} needs a reason`).toBeTruthy()
    expect(reason.length).toBeGreaterThan(4)
  }
})
