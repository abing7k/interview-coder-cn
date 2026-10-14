import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isMac, platformAlt } from '../utils/env'

export type Shortcut = {
  action: string
  key: string
  defaultKey: string
  category: string
  status?: ShortcutStatus
}

export enum ShortcutStatus {
  Registered = 'registered',
  Failed = 'failed',
  /** Shortcut is available to register but not registered. */
  Available = 'available'
}

interface ShortcutsState {
  shortcuts: Record<string, Shortcut>
}

interface ShortcutsStore extends ShortcutsState {
  updateShortcut: (action: string, shortcut: Shortcut) => void
  updateShortcuts: (shortcuts: Record<string, Shortcut>) => void
  resetShortcuts: () => void
}

type PersistedShortcutsState = {
  shortcuts?: Record<string, Shortcut>
}

function isPersistedShortcutsState(value: unknown): value is PersistedShortcutsState {
  return typeof value === 'object' && value !== null && 'shortcuts' in value
}

/**
 * Exam-critical actions are bound to bare F1~F10 — a modifier-free shortcut is
 * the only one a keyboard monitor cannot attribute to a suspicious combo, since
 * macOS delivers modifier keydowns (Cmd/Alt/Ctrl/Shift) to apps through a path
 * event taps cannot intercept. Everything else keeps a modifier-based default
 * and remains reachable from the overlay toolbar / settings.
 */
const defaultShortcuts: Record<string, Omit<Shortcut, 'defaultKey'>> = {
  takeScreenshot: { action: 'takeScreenshot', key: 'F8', category: 'Screenshot & AI' },
  appendScreenshot: { action: 'appendScreenshot', key: 'F1', category: 'Screenshot & AI' },
  stopSolutionStream: { action: 'stopSolutionStream', key: 'F2', category: 'Screenshot & AI' },
  previousApiProfile: { action: 'previousApiProfile', key: 'F3', category: 'Screenshot & AI' },
  nextApiProfile: { action: 'nextApiProfile', key: 'F4', category: 'Screenshot & AI' },
  toggleTranscription: { action: 'toggleTranscription', key: 'F5', category: 'Screenshot & AI' },
  increaseOpacity: { action: 'increaseOpacity', key: 'F6', category: 'Window Management' },
  decreaseOpacity: { action: 'decreaseOpacity', key: 'F7', category: 'Window Management' },
  pageUp: { action: 'pageUp', key: 'F9', category: 'Navigation' },
  pageDown: { action: 'pageDown', key: 'F10', category: 'Navigation' },
  clearTranscription: {
    action: 'clearTranscription',
    key: `${platformAlt}+Shift+T`,
    category: 'Screenshot & AI'
  },
  hideOrShowMainWindow: {
    action: 'hideOrShowMainWindow',
    key: `${platformAlt}+H`,
    category: 'Window Management'
  },
  ignoreOrEnableMouse: {
    action: 'ignoreOrEnableMouse',
    key: `${platformAlt}+M`,
    category: 'Window Management'
  },
  moveMainWindowUp: {
    action: 'moveMainWindowUp',
    key: 'CommandOrControl+Up',
    category: 'Window Movement'
  },
  moveMainWindowDown: {
    action: 'moveMainWindowDown',
    key: 'CommandOrControl+Down',
    category: 'Window Movement'
  },
  moveMainWindowLeft: {
    action: 'moveMainWindowLeft',
    key: 'CommandOrControl+Left',
    category: 'Window Movement'
  },
  moveMainWindowRight: {
    action: 'moveMainWindowRight',
    key: 'CommandOrControl+Right',
    category: 'Window Movement'
  }
}

export const useShortcutsStore = create<ShortcutsStore>()(
  persist(
    (set) => ({
      shortcuts: Object.fromEntries(
        Object.entries(defaultShortcuts).map(([action, shortcut]) => [
          action,
          { ...shortcut, defaultKey: shortcut.key }
        ])
      ),
      updateShortcut: (action, shortcut) => {
        set((state) => ({
          shortcuts: {
            ...state.shortcuts,
            [action]: shortcut
          }
        }))
      },
      updateShortcuts: (shortcuts) => {
        set({ shortcuts })
      },
      resetShortcuts: () => {
        set({
          shortcuts: Object.fromEntries(
            Object.entries(defaultShortcuts).map(([action, shortcut]) => [
              action,
              { ...shortcut, defaultKey: shortcut.key }
            ])
          )
        })
      }
    }),
    {
      name: 'interview-coder-shortcuts',
      version: 5,
      migrate: (state: unknown, version: number) => {
        if (!isPersistedShortcutsState(state) || !state.shortcuts) return state as ShortcutsStore
        // Merge in any new default shortcuts that are missing
        const defaults = Object.fromEntries(
          Object.entries(defaultShortcuts).map(([action, shortcut]) => [
            action,
            { ...shortcut, defaultKey: shortcut.key }
          ])
        )
        const merged = {
          ...state,
          shortcuts: {
            ...defaults,
            ...state.shortcuts
          }
        } as ShortcutsStore

        // v2→v3: On Windows, migrate Alt shortcuts to CommandOrControl (Ctrl)
        if (version < 3 && !isMac) {
          for (const [action, shortcut] of Object.entries(merged.shortcuts)) {
            merged.shortcuts[action] = {
              ...shortcut,
              key: shortcut.key.replace(/\bAlt\b/g, 'CommandOrControl'),
              defaultKey: shortcut.defaultKey.replace(/\bAlt\b/g, 'CommandOrControl')
            }
          }
        }

        return merged
      },
      merge: (persisted, current) => {
        const state = persisted as PersistedShortcutsState
        const stored = state?.shortcuts ?? {}
        // Shortcuts added after this user last saved must still appear, so the
        // defaults are the floor and the stored bindings win on top of them.
        // `merge` runs on every rehydrate, unlike `migrate` which only runs
        // when the version changes.
        const shortcuts = { ...current.shortcuts }
        for (const [action, shortcut] of Object.entries(stored)) {
          if (shortcuts[action]) shortcuts[action] = shortcut
        }
        // Keep `defaultKey` pinned to the latest code default, so "reset to
        // default" always restores the current scheme (e.g. the F-key bindings)
        for (const [action, shortcut] of Object.entries(shortcuts)) {
          if (current.shortcuts[action]) shortcut.defaultKey = current.shortcuts[action].key
        }
        // `switchApiProfile` was replaced by previous/nextApiProfile; drop it
        // so a stale binding cannot be recorded, nor linger in localStorage
        delete (shortcuts as Record<string, unknown>).switchApiProfile
        return { ...current, shortcuts }
      }
    }
  )
)
