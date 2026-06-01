import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoStore } from '@/store/demoStore'
import { useSessionStore } from '@/store/sessionStore'
import type { CameraModeName, WeddingConfig } from '@/types/session'
import { DEMO_PHOTO_CAP } from '@/store/demoStore'
import StylePreviewThumb from '@/components/StylePreviewThumb'

type Step = 'names' | 'date' | 'style' | 'timestamp' | 'generating'

const TIMESTAMP_STYLES: { value: 'classic' | 'vertical' | 'elegant'; label: string; detail: string }[] = [
  { value: 'classic',  label: 'Classic',  detail: 'Orange · bottom-right · MM DD YY + time' },
  { value: 'vertical', label: 'Vertical', detail: 'Amber · bottom-left · rotated date' },
  { value: 'elegant',  label: 'Elegant',  detail: 'Serif italic · bottom-centre · names + date' },
]

const STYLE_OPTIONS: {
  mode: CameraModeName
  label: string
  mood: string
  detail: string
}[] = [
  {
    mode: 'disposable',
    label: 'Disposable Camera',
    mood: 'Dance floor. Flash. You were there.',
    detail: 'Landscape · flash contrast · party grain',
  },
  {
    mode: 'polaroid',
    label: 'Polaroid',
    mood: 'Personal keepsake energy.',
    detail: 'Portrait · white border · signing area',
  },
  {
    mode: 'super8',
    label: 'Super 8',
    mood: "Golden hour. I'll remember this forever.",
    detail: 'Widescreen · film bloom · cinematic warmth',
  },
]

export default function DemoSetupPage() {
  const navigate = useNavigate()
  const { setSetup } = useDemoStore()
  const { setWeddingConfig } = useSessionStore()

  const [step, setStep] = useState<Step>('names')
  const [visible, setVisible] = useState(false)
  const [coupleNames, setCoupleNames] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [selectedModes, setSelectedModes] = useState<CameraModeName[]>(['disposable'])
  const [previewMode, setPreviewMode] = useState<CameraModeName>('disposable')
  const [timestampEnabled, setTimestampEnabled] = useState(true)
  const [timestampStyle, setTimestampStyle] = useState<'classic' | 'vertical' | 'elegant'>('classic')
  const inputRef = useRef<HTMLInputElement>(null)

  // Entrance animation on each step change
  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => {
      setVisible(true)
      inputRef.current?.focus()
    }, 60)
    return () => clearTimeout(t)
  }, [step])

  function toggleMode(mode: CameraModeName) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    )
  }

  function handleNamesNext() {
    if (!coupleNames.trim()) return
    setStep('date')
  }

  function handleDateNext() {
    if (!weddingDate) return
    setStep('style')
  }

  function handleStyleNext() {
    if (selectedModes.length === 0) return
    setStep('timestamp')
  }

  function handleTimestampNext() {
    setStep('generating')

    const setup = { coupleNames: coupleNames.trim(), weddingDate, selectedModes }
    setSetup(setup)

    // Build a WeddingConfig from the demo setup
    const config: WeddingConfig = {
      id: `demo-${Date.now()}`,
      coupleNames: setup.coupleNames,
      weddingDate: setup.weddingDate,
      welcomeMessage: `We\'re so glad you\'re here. Capture a moment for us.`,
      allowedModes: setup.selectedModes,
      preferredOrientation: 'any',
      annotationMode: 'signature',
      slideshowEnabled: false,
      timestampEnabled,
      timestampStyle,
      isDemoMode: true,
      photoCap: DEMO_PHOTO_CAP,
    }
    setWeddingConfig(config)

    // Brief "generating" moment for emotional effect, then transition to the wedding landing
    setTimeout(() => {
      navigate(`/w/${config.id}`)
    }, 2200)
  }

  const canContinueNames = coupleNames.trim().length > 0
  const canContinueDate = weddingDate.length > 0
  const canContinueStyle = selectedModes.length > 0

  const STEPS_ORDERED: Step[] = ['names', 'date', 'style', 'timestamp']
  function goBack() {
    const idx = STEPS_ORDERED.indexOf(step)
    if (idx <= 0) navigate('/')
    else setStep(STEPS_ORDERED[idx - 1]!)
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col safe-top safe-bottom">

      {/* Back / progress */}
      <header className="flex items-center justify-between px-6 pt-6">
        <button
          onClick={goBack}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-cream/10 touch-manipulation"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11.5L4 7l5-4.5" stroke="#f5f0e8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
          </svg>
        </button>

        {/* Step dots */}
        <div className="flex gap-1.5">
          {STEPS_ORDERED.map((s) => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width: step === s ? 16 : 5,
                height: 5,
                backgroundColor: step === s ? '#f5f0e8' : 'rgba(245,240,232,0.18)',
              }}
            />
          ))}
        </div>

        <div className="w-9" />
      </header>

      {/* Step content */}
      <main className="flex-1 flex flex-col justify-center px-8">

        {/* NAMES */}
        {step === 'names' && (
          <StepWrapper visible={visible}>
            <StepLabel>Let's start with the most important part.</StepLabel>
            <StepQuestion>What are your names?</StepQuestion>
            <input
              ref={inputRef}
              type="text"
              value={coupleNames}
              onChange={(e) => setCoupleNames(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNamesNext()}
              placeholder="Sophia & James"
              className="mt-8 w-full bg-transparent border-b border-cream/20 focus:border-cream/60 outline-none text-cream text-serif text-2xl pb-3 placeholder:text-cream/20 transition-colors duration-200"
              autoComplete="off"
              spellCheck={false}
            />
            <ContinueButton onClick={handleNamesNext} disabled={!canContinueNames} />
          </StepWrapper>
        )}

        {/* DATE */}
        {step === 'date' && (
          <StepWrapper visible={visible}>
            <StepLabel>Beautiful.</StepLabel>
            <StepQuestion>When's the big day?</StepQuestion>
            <input
              ref={inputRef}
              type="date"
              value={weddingDate}
              onChange={(e) => setWeddingDate(e.target.value)}
              className="mt-8 w-full bg-transparent border-b border-cream/20 focus:border-cream/60 outline-none text-cream text-sans text-xl pb-3 transition-colors duration-200 [color-scheme:dark]"
            />
            <ContinueButton onClick={handleDateNext} disabled={!canContinueDate} />
          </StepWrapper>
        )}

        {/* MEMORY STYLE */}
        {step === 'style' && (
          <StepWrapper visible={visible}>
            <StepLabel>One more thing.</StepLabel>
            <StepQuestion>How do you want your memories to feel?</StepQuestion>
            <p className="text-sans text-cream/35 text-xs mt-2">Choose one or more.</p>

            {/* Full-ratio preview — switches as you tap each style */}
            <div className="mt-6">
              <StylePreviewThumb
                mode={previewMode}
                sourceAlign={previewMode === 'polaroid' ? 'left' : 'center'}
                fit="natural"
                maxHeight="44vh"
              />
            </div>

            {/* Dynamic mood line */}
            <p className="text-serif text-cream/55 text-sm italic mt-3 text-center">
              {STYLE_OPTIONS.find(o => o.mode === previewMode)?.mood}
            </p>

            {/* Compact selector rows */}
            <div className="mt-4 flex flex-col">
              {STYLE_OPTIONS.map((opt, i) => {
                const selected = selectedModes.includes(opt.mode)
                const isPreviewing = previewMode === opt.mode
                return (
                  <button
                    key={opt.mode}
                    onClick={() => {
                      const isSelected = selectedModes.includes(opt.mode)
                      if (!isSelected) {
                        setPreviewMode(opt.mode)
                      } else if (opt.mode === previewMode) {
                        const remaining = selectedModes.filter(m => m !== opt.mode)
                        if (remaining.length > 0) setPreviewMode(remaining[0]!)
                      }
                      toggleMode(opt.mode)
                    }}
                    className={`flex items-center justify-between py-3.5 touch-manipulation ${i < STYLE_OPTIONS.length - 1 ? 'border-b border-cream/[0.07]' : ''}`}
                  >
                    <span className={`text-sans text-sm transition-colors ${isPreviewing || selected ? 'text-cream' : 'text-cream/45'}`}>
                      {opt.label}
                    </span>
                    <div className={`w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition-all duration-200 ${selected ? 'border-cream bg-cream' : isPreviewing ? 'border-cream/50' : 'border-cream/20'}`}>
                      {selected && (
                        <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                          <path d="M1.5 4l2 2 3-3" stroke="#1a1612" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            <ContinueButton
              onClick={handleStyleNext}
              disabled={!canContinueStyle}
            />
          </StepWrapper>
        )}

        {/* TIMESTAMP */}
        {step === 'timestamp' && (
          <StepWrapper visible={visible}>
            <StepLabel>Almost there.</StepLabel>
            <StepQuestion>Show the date on your photos?</StepQuestion>

            {/* Toggle */}
            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={() => setTimestampEnabled((v) => !v)}
                className={`
                  relative w-12 h-6 rounded-full border transition-all duration-200 touch-manipulation
                  ${timestampEnabled ? 'border-cream/60 bg-cream/10' : 'border-cream/15 bg-transparent'}
                `}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-cream transition-transform duration-200"
                  style={{ transform: timestampEnabled ? 'translateX(24px)' : 'none', opacity: timestampEnabled ? 1 : 0.35 }}
                />
              </button>
              <span className={`text-sans text-sm transition-colors ${timestampEnabled ? 'text-cream/80' : 'text-cream/30'}`}>
                {timestampEnabled ? 'Yes — stamp the date' : 'No timestamp'}
              </span>
            </div>

            {/* Style selector — only shown when timestamp is on */}
            {timestampEnabled && (
              <>
                {/* Full-ratio preview */}
                <div className="mt-6">
                  <StylePreviewThumb
                    mode="disposable"
                    timestampEnabled={true}
                    timestampStyle={timestampStyle}
                    fit="natural"
                    maxHeight="36vh"
                  />
                </div>

                {/* Compact selector rows */}
                <div className="mt-4 flex flex-col">
                  {TIMESTAMP_STYLES.map((ts, i) => {
                    const selected = timestampStyle === ts.value
                    return (
                      <button
                        key={ts.value}
                        onClick={() => setTimestampStyle(ts.value)}
                        className={`flex items-center justify-between py-3.5 touch-manipulation ${i < TIMESTAMP_STYLES.length - 1 ? 'border-b border-cream/[0.07]' : ''}`}
                      >
                        <div>
                          <p className={`text-sans text-sm transition-colors ${selected ? 'text-cream' : 'text-cream/45'}`}>
                            {ts.label}
                          </p>
                          <p className={`text-mono text-[10px] mt-0.5 tracking-wide transition-colors ${selected ? 'text-amber-film/70' : 'text-cream/20'}`}>
                            {ts.detail}
                          </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center transition-all duration-200 ${selected ? 'border-cream bg-cream' : 'border-cream/20'}`}>
                          {selected && (
                            <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4l2 2 3-3" stroke="#1a1612" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <ContinueButton onClick={handleTimestampNext} disabled={false} label="Create Our Wedding" />
          </StepWrapper>
        )}

        {/* GENERATING */}
        {step === 'generating' && (
          <StepWrapper visible={visible}>
            <div className="flex flex-col items-center text-center gap-6">
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-cream/40 animate-pulse"
                    style={{ animationDelay: `${i * 180}ms` }}
                  />
                ))}
              </div>
              <p className="text-serif text-cream text-2xl font-normal">
                Creating your wedding…
              </p>
              <p className="text-sans text-cream/40 text-sm font-light max-w-[200px] leading-relaxed">
                {coupleNames ? `${coupleNames}'s Reverie is almost ready.` : 'Your Reverie is almost ready.'}
              </p>
            </div>
          </StepWrapper>
        )}
      </main>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function StepWrapper({ children, visible }: { children: React.ReactNode; visible: boolean }) {
  return (
    <div
      className="transition-all duration-500"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(14px)' }}
    >
      {children}
    </div>
  )
}

function StepLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-mono text-cream/30 text-xs tracking-[0.2em] uppercase mb-3">
      {children}
    </p>
  )
}

function StepQuestion({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-serif text-cream font-normal" style={{ fontSize: 'clamp(1.6rem, 6vw, 2rem)', lineHeight: 1.25 }}>
      {children}
    </h2>
  )
}

function ContinueButton({ onClick, disabled, label = 'Continue' }: { onClick: () => void; disabled: boolean; label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        mt-10 w-full py-4 rounded-full text-sans text-sm font-medium tracking-widest uppercase
        transition-all duration-300 touch-manipulation
        ${disabled
          ? 'bg-cream/10 text-cream/25 cursor-default'
          : 'bg-cream text-ink active:scale-[0.97]'
        }
      `}
    >
      {label}
    </button>
  )
}
