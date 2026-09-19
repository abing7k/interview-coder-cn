import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useSettingsStore } from './lib/store/settings'
import { applyTheme } from './lib/theme'

// Paint before the first render: zustand rehydrates from localStorage
// synchronously, so the persisted theme is available here (no dark flash).
applyTheme(useSettingsStore.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
