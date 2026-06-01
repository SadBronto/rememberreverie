interface Props {
  onPress: () => void
  disabled: boolean
  phase: 'ready' | 'capturing' | 'processing' | 'uploading'
}

export default function ShutterButton({ onPress, disabled, phase }: Props) {
  const isReady = phase === 'ready' && !disabled

  return (
    <button
      onPointerDown={isReady ? onPress : undefined}
      disabled={!isReady}
      aria-label="Take photo"
      className="relative touch-manipulation select-none"
    >
      {/* Outer ring */}
      <div
        className={`
          w-20 h-20 rounded-full flex items-center justify-center
          border-2 transition-all duration-150
          ${isReady ? 'border-cream/80 active:scale-95' : 'border-cream/20'}
        `}
      >
        {/* Inner disc */}
        <div
          className={`
            rounded-full transition-all duration-150
            ${phase === 'processing' || phase === 'capturing'
              ? 'w-8 h-8 bg-amber-film/60'
              : isReady
              ? 'w-14 h-14 bg-cream active:w-12 active:h-12'
              : 'w-14 h-14 bg-cream/20'
            }
          `}
        />
      </div>

      {/* Processing ring animation */}
      {(phase === 'processing' || phase === 'capturing') && (
        <div className="absolute inset-0 rounded-full border-2 border-amber-film/40 animate-ping" />
      )}
    </button>
  )
}
