import { useEffect, useRef } from 'react'
import type { CameraModeName } from '@/types/session'
import { CAMERA_MODES } from '@/config/modes'

interface Props {
  modes: CameraModeName[]
  selected: CameraModeName
  onChange: (mode: CameraModeName) => void
}

export default function ModeSelector({ modes, selected, onChange }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  // With all six styles the row is wider than a phone, so the pill scrolls
  // horizontally. Keep the active style scrolled into view.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selected])

  return (
    <div className="flex items-center gap-1 bg-black/30 backdrop-blur-md rounded-full px-1.5 py-1.5 border border-white/10 max-w-[calc(100vw-1.5rem)] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {modes.map((mode) => {
        const isSelected = mode === selected
        return (
          <button
            key={mode}
            ref={isSelected ? selectedRef : undefined}
            onClick={() => onChange(mode)}
            className={`
              shrink-0 px-4 py-1.5 rounded-full text-sans text-xs tracking-widest uppercase whitespace-nowrap
              transition-all duration-200 touch-manipulation
              ${isSelected
                ? 'bg-cream text-ink font-medium'
                : 'text-cream/50 hover:text-cream/80 font-normal'
              }
            `}
          >
            {CAMERA_MODES[mode].label}
          </button>
        )
      })}
    </div>
  )
}
