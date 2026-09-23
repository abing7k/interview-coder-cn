import { toast } from 'sonner'
import { cjkSpacing, findProvider, normalizeBaseURL } from './providers'
import { useSettingsStore } from './store/settings'

/**
 * Change the API Base URL; when the model is switched along with it, say so in
 * a toast that can undo the switch.
 */
export function changeApiBaseURL(url: string): void {
  const change = useSettingsStore.getState().setApiBaseURL(url)
  if (!change) return

  const name = findProvider(url)?.name
  const title = cjkSpacing(
    {
      translated: `模型已换成${name}的写法`,
      remembered: `已恢复上次在${name ?? '该地址'}使用的模型`,
      default: change.from ? `${name}上没有找到对应模型，已改用推荐模型` : `已选择${name}推荐的模型`
    }[change.reason]
  )

  toast(title, {
    description: change.from ? `${change.from} → ${change.to}` : change.to,
    duration: 8000,
    action: change.from
      ? {
          label: '撤销',
          onClick: () => {
            const state = useSettingsStore.getState()
            // Only undo while nothing has been changed since
            if (
              normalizeBaseURL(state.apiBaseURL) === normalizeBaseURL(url) &&
              state.model === change.to
            ) {
              state.setModel(change.from)
            }
          }
        }
      : undefined
  })
}
