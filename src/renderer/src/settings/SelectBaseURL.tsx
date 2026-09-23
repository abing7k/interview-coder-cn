import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronsUpDown, Check, Plus, X } from 'lucide-react'
import { useSettingsStore } from '@/lib/store/settings'
import { PROVIDERS, findProvider } from '@/lib/providers'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'

/** Preset endpoints; OpenAI needs no entry, it is what an empty URL means */
const defaultBaseURLs = PROVIDERS.filter((p) => p.id !== 'openai').map((p) => ({
  value: p.baseURL,
  label: p.baseURL
}))

/**
 * API Base URL picker: same combobox behaviour as SelectModel — pick a preset,
 * or type a URL to create and remember your own. Clearing the selection falls
 * back to the OpenAI default the main process assumes for an empty value.
 */
export function SelectBaseURL({
  value,
  onChange,
  disabled,
  className
}: {
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const { customBaseURLs, updateSetting } = useSettingsStore()

  const urls = useMemo(() => {
    // A URL saved as custom before it became a preset would otherwise show up twice
    const customItems = customBaseURLs
      .filter((u) => !defaultBaseURLs.some((d) => d.value === u))
      .map((u) => ({ value: u, label: u, isCustom: true }))
    const defaultItems = defaultBaseURLs.map((u) => ({ ...u, isCustom: false }))
    return [...customItems, ...defaultItems]
  }, [customBaseURLs])

  const addCustomBaseURL = (newURL: string) => {
    const newValue = newURL.trim()
    if (!newValue) return
    const exists = urls.some((u) => u.value === newValue)
    if (exists) {
      onChange?.(newValue)
      setOpen(false)
      setSearchValue('')
      return
    }
    updateSetting('customBaseURLs', [...customBaseURLs, newValue])
    onChange?.(newValue)
    setSearchValue('')
    setOpen(false)
  }

  const deleteCustomBaseURL = (val: string) => {
    updateSetting(
      'customBaseURLs',
      customBaseURLs.filter((u) => u !== val)
    )
    if (value === val) {
      onChange?.('')
    }
  }

  const filtered = urls.filter((u) => u.label.toLowerCase().includes(searchValue.toLowerCase()))
  const showCreate =
    searchValue && !filtered.some((u) => u.label.toLowerCase() === searchValue.toLowerCase())

  // A search left over from last time would silently hide most of the list
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setSearchValue('')
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-60 justify-between overflow-hidden', className)}
        >
          <span className="truncate">
            {value ? (urls.find((u) => u.value === value)?.label ?? value) : '选择 API 地址...'}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-60 max-w-[26rem] p-0">
        <Command>
          <CommandInput
            placeholder="输入以搜索或创建..."
            className="h-9"
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>未找到结果</CommandEmpty>
            <CommandGroup>
              {filtered.map((u) => (
                <div key={u.value} className="group flex">
                  <CommandItem
                    value={u.value}
                    onSelect={(current) => {
                      onChange?.(current === value ? '' : current)
                      setSearchValue('')
                      setOpen(false)
                    }}
                    className="flex-1 overflow-hidden"
                  >
                    <span className="truncate">{u.label}</span>
                    {findProvider(u.value) && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {findProvider(u.value)!.name}
                      </span>
                    )}
                    <Check
                      className={cn('ml-auto', value === u.value ? 'opacity-100' : 'opacity-0')}
                    />
                  </CommandItem>
                  {u.isCustom && (
                    <div className="hidden group-hover:flex">
                      <button
                        className="text-gray-400 hover:text-red-500 cursor-pointer"
                        onClick={() => deleteCustomBaseURL(u.value)}
                      >
                        <X className="h-6 w-6" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {showCreate && (
                <CommandItem
                  value={`create-${searchValue}`}
                  onSelect={() => addCustomBaseURL(searchValue)}
                  className="!text-blue-600"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  创建 “{searchValue}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
