/**
 * App colour theme. `dark` is the original translucent dark grey look; `light`
 * paints the window white with dark text so it blends into a white exam page.
 */
export type Theme = 'dark' | 'light'

export const DEFAULT_THEME: Theme = 'dark'

/**
 * The theme is carried by a `data-theme` attribute on <html>, which every
 * colour in base.css/main.css keys off (see the `--app-*` variables).
 */
export function applyTheme(theme: Theme | string | undefined | null): void {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark'
}
