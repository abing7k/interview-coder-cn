import { ipcMain, systemPreferences } from 'electron'
import keyhook from 'keyhook'
import type { KeyCombo } from 'keyhook'

export type { KeyCombo }

/**
 * Swallow mode: registered shortcuts are intercepted by a system-level
 * CGEventTap and never reach the focused app, so a browser exam page cannot
 * see them. Everything except the registered combos passes through untouched.
 */

/** Key codes of the macOS virtual keyboard (kVK_*), used to map accelerator keys */
const KEY_CODE_MAP: Record<string, number> = {
  A: 0,
  S: 1,
  D: 2,
  F: 3,
  H: 4,
  G: 5,
  Z: 6,
  X: 7,
  C: 8,
  V: 9,
  B: 11,
  Q: 12,
  W: 13,
  E: 14,
  R: 15,
  Y: 16,
  T: 17,
  '1': 18,
  '2': 19,
  '3': 20,
  '4': 21,
  '6': 22,
  '5': 23,
  '=': 24,
  '9': 25,
  '7': 26,
  '-': 27,
  '8': 28,
  '0': 29,
  ']': 30,
  O: 31,
  U: 32,
  '[': 33,
  I: 34,
  P: 35,
  Enter: 36,
  Return: 36,
  L: 37,
  J: 38,
  "'": 39,
  K: 40,
  ';': 41,
  '\\': 42,
  ',': 43,
  '/': 44,
  N: 45,
  M: 46,
  '.': 47,
  Tab: 48,
  Space: 49,
  '`': 50,
  Backspace: 51,
  Delete: 51,
  Escape: 53,
  Esc: 53,
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111,
  F13: 105,
  F14: 107,
  F15: 113,
  F16: 106,
  F17: 64,
  F18: 79,
  F19: 80,
  F20: 90,
  Up: 126,
  Down: 125,
  Left: 123,
  Right: 124,
  Home: 115,
  End: 119,
  PageUp: 116,
  PageDown: 121
}

/** True when the swallow hook can run on this machine */
export const isKeyHookAvailable = process.platform === 'darwin' && keyhook.available

/**
 * Turn an Electron accelerator (e.g. `Alt+Enter`) into the physical key code
 * plus modifier set the event tap matches. Returns null when the key is not
 * mappable (media keys etc.); those shortcuts keep their globalShortcut.
 */
export function parseAccelerator(accel: string): KeyCombo | null {
  const parts = accel.split('+').map((part) => part.trim())
  const key = parts[parts.length - 1]
  const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()))

  let keyCode: number | undefined
  let forceShift = false
  if (key.toLowerCase() === 'plus') {
    // `Plus` is Shift+= on the main keyboard
    keyCode = KEY_CODE_MAP['=']
    forceShift = true
  } else {
    keyCode = KEY_CODE_MAP[key] ?? KEY_CODE_MAP[key.toUpperCase()]
  }
  if (keyCode === undefined) return null

  return {
    keyCode,
    alt: modifiers.has('alt') || modifiers.has('option'),
    shift: forceShift || modifiers.has('shift'),
    cmd: modifiers.has('command') || modifiers.has('commandorcontrol') || modifiers.has('cmd'),
    ctrl: modifiers.has('control') || modifiers.has('ctrl')
  }
}

/**
 * The hook keeps the callback it got on its first start, so route every
 * trigger through one stable function that reads the current handler.
 */
let triggerHandler: ((index: number) => void) | null = null
const stableTrigger = (index: number) => triggerHandler?.(index)

export function startKeyHook(combos: KeyCombo[], onTrigger: (index: number) => void): boolean {
  if (!isKeyHookAvailable || combos.length === 0) return false
  triggerHandler = onTrigger
  return keyhook.start(combos, stableTrigger)
}

export function stopKeyHook(): void {
  keyhook.stop()
  triggerHandler = null
}

export interface KeyHookStatus {
  /** The feature exists on this platform */
  supported: boolean
  /** The native addon compiled and loaded */
  available: boolean
  /** macOS accessibility permission granted (required for the event tap) */
  trusted: boolean
  /** The tap is currently running */
  active: boolean
}

export function getKeyHookStatus(): KeyHookStatus {
  return {
    supported: process.platform === 'darwin',
    available: keyhook.available,
    trusted: process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient(false),
    active: keyhook.isRunning()
  }
}

/** Prompt for the macOS accessibility grant the event tap needs */
export function requestKeyHookPermission(): boolean {
  if (process.platform !== 'darwin') return false
  return systemPreferences.isTrustedAccessibilityClient(true)
}

ipcMain.handle('getKeyHookStatus', () => getKeyHookStatus())
ipcMain.handle('requestKeyHookPermission', () => requestKeyHookPermission())

/** Notified when the user flips the swallow-mode switch; see shortcuts.ts */
let modeChangeHandler: (() => void) | null = null
export function setKeyHookModeChangeHandler(handler: () => void): void {
  modeChangeHandler = handler
}
export function notifyKeyHookModeChange(): void {
  modeChangeHandler?.()
}
