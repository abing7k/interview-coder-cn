import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import codingPrompt from './prompts/coding.md?raw'
import englishExamPrompt from './prompts/english-exam.md?raw'
import aptitudeTestPrompt from './prompts/aptitude-test.md?raw'
import generalQaPrompt from './prompts/general-qa.md?raw'
import { DEFAULT_THEME, type Theme } from '../theme'
import { normalizeBaseURL, resolveLinkedModel, type ModelSwitchReason } from '../providers'

export type { Theme }

export interface PromptScene {
  id: string
  name: string
  prompt: string
  isPreset: boolean
}

export const CODING_SCENE_ID = 'coding'

/** Default prompts for all preset scenes, maintained as Markdown files under ./prompts */
export const PRESET_SCENE_PROMPTS: Record<string, string> = {
  [CODING_SCENE_ID]: codingPrompt,
  'english-exam': englishExamPrompt,
  'aptitude-test': aptitudeTestPrompt,
  'general-qa': generalQaPrompt
}

const createPresetScenes = (): PromptScene[] => [
  {
    id: CODING_SCENE_ID,
    name: '解算法题',
    prompt: PRESET_SCENE_PROMPTS[CODING_SCENE_ID],
    isPreset: true
  },
  {
    id: 'english-exam',
    name: '英语考试',
    prompt: PRESET_SCENE_PROMPTS['english-exam'],
    isPreset: true
  },
  {
    id: 'aptitude-test',
    name: '能力测评',
    prompt: PRESET_SCENE_PROMPTS['aptitude-test'],
    isPreset: true
  },
  {
    id: 'general-qa',
    name: '通用问答',
    prompt: PRESET_SCENE_PROMPTS['general-qa'],
    isPreset: true
  }
]

/** Derive the `customPrompt` (the system prompt used by the main process) from the active scene */
function composeCustomPrompt(scenes: PromptScene[], activeSceneId: string): string {
  const scene = scenes.find((s) => s.id === activeSceneId)
  if (!scene) return PRESET_SCENE_PROMPTS[CODING_SCENE_ID]
  // An emptied preset scene falls back to its default prompt
  return scene.prompt.trim() || PRESET_SCENE_PROMPTS[scene.id] || ''
}

/** How captured screenshots are shown on the main page, ordered by how much room they take */
export type ScreenshotDisplay = 'none' | 'count' | 'gallery'

export const OPACITY_MIN = 0.1
export const OPACITY_MAX = 1
export const OPACITY_STEP = 0.05

interface Settings {
  /** Window colour scheme; `light` is a white background with dark text */
  theme: Theme
  apiBaseURL: string
  /** API Base URL entries the user created from the picker, kept as a shortcut list */
  customBaseURLs: string[]
  apiKey: string
  model: string
  /** Custom models created before they were kept per API Base URL; offered for every URL */
  customModels: string[]
  /** Custom models the user created, keyed by normalized API Base URL */
  customModelsByBaseURL: Record<string, string[]>
  /** Last model used with each normalized API Base URL, restored when switching back */
  modelByBaseURL: Record<string, string>
  customPrompt: string

  scenes: PromptScene[]
  activeSceneId: string

  opacity: number
  /** Allow resizing the main window and overlay toolbar */
  resizable: boolean
  /** Show the click-through overlay toolbar above the main window */
  showOverlayToolbar: boolean
  /** Dwell time in ms before hovering a toolbar button fires it; 0 disables hover triggering */
  toolbarHoverDelay: number
  /** How the captured screenshots are shown above the solution */
  screenshotDisplay: ScreenshotDisplay

  screenshotAutoSave: boolean
  screenshotDir: string

  dashscopeApiKey: string

  hideDockIcon: boolean

  audioInputDeviceId: string
  audioOutputDeviceId: string
}

/** A model change made on the user's behalf when the API Base URL changed */
export interface ModelSwitch {
  from: string
  to: string
  reason: ModelSwitchReason
}

interface SettingsStore extends Settings {
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /** Change the API Base URL and carry the model over to the new platform's spelling */
  setApiBaseURL: (url: string) => ModelSwitch | null
  /** Change the model, remembering it for the current API Base URL */
  setModel: (model: string) => void
  addCustomModel: (baseURL: string, model: string) => void
  removeCustomModel: (baseURL: string, model: string) => void
  /** Step the window opacity within [OPACITY_MIN, OPACITY_MAX] */
  adjustOpacity: (delta: number) => void
  syncSettings: (settings: Partial<Settings>) => void
  setActiveScene: (id: string) => void
  updateScenePrompt: (id: string, prompt: string) => void
  addScene: (name: string) => string
  removeScene: (id: string) => void
}

const defaultSettings: Settings = {
  theme: DEFAULT_THEME,
  apiBaseURL: '',
  customBaseURLs: [],
  apiKey: '',
  model: '',
  customModels: [],
  customModelsByBaseURL: {},
  modelByBaseURL: {},
  customPrompt: PRESET_SCENE_PROMPTS[CODING_SCENE_ID],
  scenes: createPresetScenes(),
  activeSceneId: CODING_SCENE_ID,

  opacity: 0.8,
  resizable: true,
  showOverlayToolbar: true,
  toolbarHoverDelay: 1000,
  screenshotDisplay: 'gallery',

  screenshotAutoSave: false,
  screenshotDir: '',

  dashscopeApiKey: '',

  hideDockIcon: false,

  audioInputDeviceId: '',
  audioOutputDeviceId: ''
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      updateSetting: (key, value) => {
        set({ [key]: value })
      },
      setApiBaseURL: (url) => {
        const state = get()
        const from = normalizeBaseURL(state.apiBaseURL)
        const to = normalizeBaseURL(url)
        if (from === to) {
          set({ apiBaseURL: url })
          return null
        }
        const modelByBaseURL = { ...state.modelByBaseURL }
        if (state.model) modelByBaseURL[from] = state.model
        const linked = resolveLinkedModel({
          model: state.model,
          baseURL: to,
          remembered: modelByBaseURL[to],
          customModels: state.customModelsByBaseURL[to] ?? []
        })
        const model = linked?.model ?? state.model
        if (model) modelByBaseURL[to] = model
        set({ apiBaseURL: url, model, modelByBaseURL })
        return linked && linked.model !== state.model
          ? { from: state.model, to: linked.model, reason: linked.reason }
          : null
      },
      setModel: (model) => {
        set((state) => {
          const key = normalizeBaseURL(state.apiBaseURL)
          const modelByBaseURL = { ...state.modelByBaseURL }
          if (model) modelByBaseURL[key] = model
          else delete modelByBaseURL[key]
          return { model, modelByBaseURL }
        })
      },
      addCustomModel: (baseURL, model) => {
        set((state) => {
          const key = normalizeBaseURL(baseURL)
          const list = state.customModelsByBaseURL[key] ?? []
          if (list.includes(model) || state.customModels.includes(model)) return {}
          return {
            customModelsByBaseURL: { ...state.customModelsByBaseURL, [key]: [...list, model] }
          }
        })
      },
      removeCustomModel: (baseURL, model) => {
        set((state) => {
          const key = normalizeBaseURL(baseURL)
          const customModelsByBaseURL = { ...state.customModelsByBaseURL }
          const list = (customModelsByBaseURL[key] ?? []).filter((m) => m !== model)
          if (list.length > 0) customModelsByBaseURL[key] = list
          else delete customModelsByBaseURL[key]
          return {
            customModels: state.customModels.filter((m) => m !== model),
            customModelsByBaseURL
          }
        })
      },
      adjustOpacity: (delta) => {
        const raw = get().opacity + delta
        // Round to 2 decimals to avoid float drift across repeated presses
        const opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(raw * 100) / 100))
        set({ opacity })
      },
      syncSettings: (settings) => {
        set(settings)
      },
      setActiveScene: (id) => {
        set((state) => ({
          activeSceneId: id,
          customPrompt: composeCustomPrompt(state.scenes, id)
        }))
      },
      updateScenePrompt: (id, prompt) => {
        set((state) => {
          const scenes = state.scenes.map((s) => (s.id === id ? { ...s, prompt } : s))
          return {
            scenes,
            customPrompt: composeCustomPrompt(scenes, state.activeSceneId)
          }
        })
      },
      addScene: (name) => {
        const id = `custom-${Date.now()}`
        set((state) => {
          const scenes = [...state.scenes, { id, name, prompt: '', isPreset: false }]
          return {
            scenes,
            activeSceneId: id,
            customPrompt: composeCustomPrompt(scenes, id)
          }
        })
        return id
      },
      removeScene: (id) => {
        const scene = get().scenes.find((s) => s.id === id)
        if (!scene || scene.isPreset) return
        set((state) => {
          const scenes = state.scenes.filter((s) => s.id !== id)
          const activeSceneId = state.activeSceneId === id ? CODING_SCENE_ID : state.activeSceneId
          return {
            scenes,
            activeSceneId,
            customPrompt: composeCustomPrompt(scenes, activeSceneId)
          }
        })
      }
    }),
    {
      name: 'interview-coder-settings',
      version: 8,
      migrate: (persisted, version) => {
        const state = persisted as Partial<Settings>
        // Drop the legacy codeLanguage field (language now lives in the prompt text)
        delete (state as Record<string, unknown>).codeLanguage
        if (version < 8) {
          // Hover-delay options are now 0.5s / 1s / 2s; snap the retired ones
          // so the Select still matches an item
          if (state.toolbarHoverDelay === 800 || state.toolbarHoverDelay === 1200) {
            state.toolbarHoverDelay = 1000
          }
        }
        if (version < 5) {
          // Convert the legacy free-form customPrompt into a custom scene
          const scenes = createPresetScenes()
          let activeSceneId = CODING_SCENE_ID
          const legacyPrompt = (state.customPrompt ?? '').trim()
          if (legacyPrompt) {
            const id = `custom-${Date.now()}`
            scenes.push({ id, name: '自定义场景', prompt: legacyPrompt, isPreset: false })
            activeSceneId = id
          }
          return { ...state, scenes, activeSceneId }
        }
        return state
      },
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<Settings>) }
        // Ensure preset scenes always exist (keep user-edited prompts),
        // so presets added in future versions show up for existing users
        const persistedScenes = Array.isArray(state.scenes) ? state.scenes : []
        state.scenes = [
          ...createPresetScenes().map((p) => {
            const saved = persistedScenes.find((s) => s.id === p.id)
            // Restore the default prompt if a preset scene was left empty
            return saved?.prompt.trim() ? saved : p
          }),
          ...persistedScenes.filter((s) => !s.isPreset)
        ]
        if (!state.scenes.some((s) => s.id === state.activeSceneId)) {
          state.activeSceneId = CODING_SCENE_ID
        }
        state.customPrompt = composeCustomPrompt(state.scenes, state.activeSceneId)
        return state
      }
    }
  )
)
