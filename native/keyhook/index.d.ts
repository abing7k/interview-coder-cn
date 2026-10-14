export interface KeyCombo {
  keyCode: number
  alt: boolean
  shift: boolean
  cmd: boolean
  ctrl: boolean
}

export const available: boolean
export function start(combos: KeyCombo[], callback: (index: number) => void): boolean
export function stop(): void
export function isRunning(): boolean
