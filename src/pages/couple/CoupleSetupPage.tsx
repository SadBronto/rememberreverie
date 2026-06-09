import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { CameraModeName, WeddingConfig } from '@/types/session'
import StylePreviewThumb from '@/components/StylePreviewThumb'
import { useDemoStore } from '@/store/demoStore'
import { DEMO_WEDDING_ID } from '@/demo/demoConfig'

type Step = 'loading' | 'names' | 'date' | 'style' | 'annotation' | 'timestamp' | 'welcome' | 'saving' | 'error'

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
  { mode: 'disposable', label: 'Disposable Camera', mood: 'Dance floor. Flash. You were there.',         detail: 'Landscape · flash contrast · party grain' },
  { mode: 'polaroid',   label: 'Polaroid',          mood: 'Personal keepsake energy.',                   detail: 'Portrait · white border · signing area' },
  { mode: 'super8',     label: 'Super 8',           mood: "Golden hour. I'll remember this forever.",    detail: 'Widescreen · film bloom · cinematic warmth' },
]

const ANNOTATION_OPTIONS = [
  { value: 'signature', label: 'Signature', detail: 'Guests sign polaroid photos with their name.' },
  { value: 'doodle',    label: 'Doodle',    detail: 'Guests draw freely on their photos.' },
  { value: 'disabled',  label: 'Off',       detail: 'No signing or drawing on photos.' },
]

const STEPS_ORDERED: Step[] = ['names', 'date', 'style', 'annotation', 'timestamp', 'welcome']

export default function CoupleSetupPage() {
  const navigate = useNavigate()
  const demo = useLocation().pathname.startsWith('/demo')
  const demoConfig = useDemoStore((s) => s.config)
  const applySetup = useDemoStore((s) => s.applySetup)

  const [step, setStep]                       = useState<Step>('loading')
  const [visible, setVisible]                 = useState(false)
  const [weddingId, setWeddingId]             = useState<string | null>(null)
  const [tokenRef]                            = useState<{ current: string | null }>({ current: null })
  const [errorMsg, setErrorMsg]               = useState('')

  const [coupleNames, setCoupleNames]         = useState('')
  const [weddingDate, setWeddingDate]         = useState('')
  const [noDate, setNoDate]                   = useState(false)
  const [selectedModes, setSelectedModes]     = useState<CameraModeName[]>(['disposable'])
  const [previewMode, setPreviewMode]         = useState<CameraModeName>('disposable')
  const [annotationMode, setAnnotationMode]   = useState<'signature' | 'doodle' | 'disabled'>('signature')
  const [timestampEnabled, setTimestampEnabled] = useState(true)
  const [timestampStyle, setTimestampStyle]   = useState<'classic' | 'vertical' | 'elegant'>('classic')
  const [welcomeMessage, setWelcomeMessage]   = useState('Leave us a memory.')

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // ── Load their wedding on mount ──────────────────────────────────────────────
  useEffect(() => {
    // Demo mode: prefill from the demo store, no auth/backend.
    if (demo) {
      setWeddingId(DEMO_WEDDING_ID)
      setCoupleNames(demoConfig.coupleNames === 'Avery & Jordan' ? '' : demoConfig.coupleNames)
      setWeddingDate(demoConfig.weddingDate ?? '')
      setNoDate(!demoConfig.weddingDate)
      setSelectedModes(demoConfig.allowedModes)
      setPreviewMode(demoConfig.allowedModes[0] ?? 'disposable')
      setAnnotationMode(demoConfig.annotationMode)
      setTimestampEnabled(demoConfig.timestampEnabled)
      setTimestampStyle(demoConfig.timestampStyle)
      setWelcomeMessage(demoConfig.welcomeMessage)
      setStep('names')
      return
    }

    async function load() {
      if (!supabase) { setErrorMsg('App not configured.'); setStep('error'); return }
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/couple/login', { replace: true }); return }
      tokenRef.current = session.access_token

      const res = await fetch('/api/couple/wedding', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (res.status === 404) {
        navigate('/couple/no-wedding', { replace: true })
        return
      }
      if (!res.ok) {
        setErrorMsg('Could not load your wedding. Please try again.')
        setStep('error')
        return
      }

      const data = await res.json()
      setWeddingId(data.id)

      // If already configured, skip setup entirely
      if (data.status !== 'pending_setup') {
        navigate(`/couple/${data.id}`, { replace: true })
        return
      }

      // Pre-fill any existing values the admin may have set
      if (data.couple_names && data.couple_names !== 'TBD') setCoupleNames(data.couple_names)
      if (data.wedding_date) setWeddingDate(data.wedding_date)
      else if (data.is_event) setNoDate(true)

      setStep('names')
    }
    load()
  }, [navigate, tokenRef])

  // Entrance animation on each step change
  useEffect(() => {
    if (step === 'loading' || step === 'saving' || step === 'error') return
    setVisible(false)
    const t = setTimeout(() => {
      setVisible(true)
      // Focus text inputs when they appear
      ;(inputRef.current as HTMLElement | null)?.focus()
    }, 60)
    return () => clearTimeout(t)
  }, [step])

  function toggleMode(mode: CameraModeName) {
    setSelectedModes(prev =>
      prev.includes(mode) ? prev.filter(m => m !== mode) : [...prev, mode]
    )
  }

  function goBack() {
    const idx = STEPS_ORDERED.indexOf(step as Step)
    if (idx <= 0) return
    setStep(STEPS_ORDERED[idx - 1]!)
  }

  function goNext(next: Step) {
    setStep(next)
  }

  async function handleFinish() {
    // Demo mode: apply choices to the demo store and drop into the Client gallery.
    if (demo) {
      const overrides: Partial<WeddingConfig> = {
        coupleNames:      coupleNames.trim() || 'Avery & Jordan',
        weddingDate:      noDate ? null : weddingDate,
        welcomeMessage:   welcomeMessage.trim() || 'Leave us a memory.',
        allowedModes:     selectedModes,
        annotationMode,
        timestampEnabled,
        timestampStyle,
      }
      applySetup(overrides)
      navigate(`/couple/${DEMO_WEDDING_ID}`)
      return
    }

    if (!tokenRef.current || !weddingId) return
    setStep('saving')

    const res = await fetch('/api/couple/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({
        coupleNames: coupleNames.trim(),
        weddingDate: noDate ? null : weddingDate,
        welcomeMessage: welcomeMessage.trim() || 'Leave us a memory.',
        allowedModes: selectedModes,
        annotationMode,
        timestampEnabled,
        timestampStyle,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      setErrorMsg(text || 'Setup failed. Please try again.')
      setStep('error')
      return
    }

    const data = await res.json()
    navigate(`/couple/${data.weddingId}`, { replace: true })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const canContinueNames  = coupleNames.trim().length > 0
  const canContinueDate   = noDate || weddingDate.length > 0
  const canContinueStyle  = selectedModes.length > 0
  const stepIndex         = STEPS_ORDERED.indexOf(step as Step)

  // ── Loading / saving / error screens ────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="min-h-dvh bg-ink flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cream/20 border-t-cream/70 animate-spin" />
      </div>
    )
  }

  if (step === 'saving') {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-6 text-center px-8">
        <div className="flex gap-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-cream/40 animate-pulse" style={{ animationDelay: `${i * 180}ms` }} />
          ))}
        </div>
        <p className="text-serif text-cream text-2xl font-normal">Setting up your wedding…</p>
        <p className="text-sans text-cream/40 text-sm font-light max-w-[220px] leading-relaxed">
          Your Reverie is almost ready.
        </p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="min-h-dvh bg-ink flex flex-col items-center justify-center gap-6 text-center px-8">
        <p className="text-serif text-cream text-xl">Something went wrong</p>
        <p className="text-sans text-cream/40 text-sm max-w-[260px]">{errorMsg}</p>
        <button
          onClick={() => navigate('/couple/login')}
          className="px-6 py-3 rounded-full border border-cream/15 text-cream/60 text-sans text-xs tracking-widest uppercase touch-manipulation"
        >
          Back to login
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-ink flex flex-col safe-top safe-bottom">

      {/* Back / progress dots */}
      <header className="flex items-center justify-between px-6 pt-6">
        <button
          onClick={goBack}
          className={`w-9 h-9 flex items-center justify-center rounded-full border border-cream/10 touch-manipulation ${stepIndex <= 0 ? 'opacity-0 pointer-events-none' : ''}`}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11.5L4 7l5-4.5" stroke="#f5f0e8" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.5"/>
          </svg>
        </button>

        {/* Step dots */}
        <div className="flex gap-1.5">
          {STEPS_ORDERED.map((s, i) => (
            <div
              key={s}
              className="rounded-full transition-all duration-300"
              style={{
                width:           step === s ? 16 : 5,
                height:          5,
                backgroundColor: i <= stepIndex ? 'rgba(245,240,232,0.7)' : 'rgba(245,240,232,0.15)',
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
            <StepLabel>Welcome! Let's get you set up.</StepLabel>
            <StepQuestion>What are your names?</StepQuestion>
            <input
              ref={el => { inputRef.current = el }}
              type="text"
              value={coupleNames}
              onChange={e => setCoupleNames(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canContinueNames && goNext('date')}
              placeholder="Sophia & James"
              className="mt-8 w-full bg-transparent border-b border-cream/20 focus:border-cream/60 outline-none text-cream text-serif text-2xl pb-3 placeholder:text-cream/20 transition-colors duration-200"
              autoComplete="off"
              spellCheck={false}
            />
            <ContinueButton onClick={() => goNext('date')} disabled={!canContinueNames} />
          </StepWrapper>
        )}

        {/* DATE */}
        {step === 'date' && (
          <StepWrapper visible={visible}>
            <StepLabel>Beautiful.</StepLabel>
            <StepQuestion>When's the big day?</StepQuestion>
            {!noDate && (
              <input
                ref={el => { inputRef.current = el }}
                type="date"
                value={weddingDate}
                onChange={e => setWeddingDate(e.target.value)}
                className="mt-8 w-full bg-transparent border-b border-cream/20 focus:border-cream/60 outline-none text-cream text-sans text-xl pb-3 transition-colors duration-200 [color-scheme:dark]"
              />
            )}
            <button
              onClick={() => setNoDate(v => !v)}
              className="mt-6 flex items-center gap-3 touch-manipulation"
            >
              <span className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${noDate ? 'bg-cream' : 'bg-cream/15'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${noDate ? 'left-7 bg-ink' : 'left-1 bg-cream/40'}`} />
              </span>
              <span className={`text-sans text-sm transition-colors ${noDate ? 'text-cream/80' : 'text-cream/40'}`}>
                No set date / ongoing event
              </span>
            </button>
            <ContinueButton onClick={() => goNext('style')} disabled={!canContinueDate} />
          </StepWrapper>
        )}

        {/* MEMORY STYLE */}
        {step === 'style' && (
          <StepWrapper visible={visible}>
            <StepLabel>Now for the fun part.</StepLabel>
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

            <ContinueButton onClick={() => goNext('annotation')} disabled={!canContinueStyle} />
          </StepWrapper>
        )}

        {/* ANNOTATION */}
        {step === 'annotation' && (
          <StepWrapper visible={visible}>
            <StepLabel>Personal touches.</StepLabel>
            <StepQuestion>Can guests sign or draw on their photos?</StepQuestion>
            <p className="text-sans text-cream/35 text-xs mt-2">Applies to all photo styles.</p>
            <div className="mt-8 flex flex-col gap-3">
              {ANNOTATION_OPTIONS.map(opt => {
                const selected = annotationMode === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => setAnnotationMode(opt.value as typeof annotationMode)}
                    className={`w-full text-left rounded-2xl px-5 py-4 border transition-all duration-200 touch-manipulation ${selected ? 'border-cream/50 bg-cream/[0.06]' : 'border-cream/10'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className={`text-sans text-sm font-medium ${selected ? 'text-cream' : 'text-cream/60'}`}>{opt.label}</p>
                        <p className={`text-mono text-[10px] mt-1.5 tracking-wide ${selected ? 'text-amber-film/70' : 'text-cream/20'}`}>{opt.detail}</p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center transition-all ${selected ? 'border-cream bg-cream' : 'border-cream/25'}`}>
                        {selected && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="#1a1612" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
            <ContinueButton onClick={() => goNext('timestamp')} disabled={false} />
          </StepWrapper>
        )}

        {/* TIMESTAMP */}
        {step === 'timestamp' && (
          <StepWrapper visible={visible}>
            <StepLabel>A little detail.</StepLabel>
            <StepQuestion>Show the date on your photos?</StepQuestion>

            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={() => setTimestampEnabled(v => !v)}
                className={`relative w-12 h-6 rounded-full border transition-all duration-200 touch-manipulation ${timestampEnabled ? 'border-cream/60 bg-cream/10' : 'border-cream/15 bg-transparent'}`}
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
            <ContinueButton onClick={() => goNext('welcome')} disabled={false} />
          </StepWrapper>
        )}

        {/* WELCOME MESSAGE */}
        {step === 'welcome' && (
          <StepWrapper visible={visible}>
            <StepLabel>Almost there.</StepLabel>
            <StepQuestion>What do you want to say to your guests?</StepQuestion>
            <p className="text-sans text-cream/35 text-xs mt-2">Shown on the landing page when guests scan your QR code.</p>
            <textarea
              ref={el => { inputRef.current = el }}
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              rows={3}
              placeholder="Leave us a memory."
              className="mt-8 w-full bg-transparent border-b border-cream/20 focus:border-cream/60 outline-none text-cream text-sans text-lg pb-3 placeholder:text-cream/20 transition-colors duration-200 resize-none"
            />
            <ContinueButton
              onClick={handleFinish}
              disabled={false}
              label="Create Our Wedding"
            />
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
    <p className="text-mono text-cream/30 text-xs tracking-[0.2em] uppercase mb-3">{children}</p>
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
      className={`mt-10 w-full py-4 rounded-full text-sans text-sm font-medium tracking-widest uppercase transition-all duration-300 touch-manipulation ${disabled ? 'bg-cream/10 text-cream/25 cursor-default' : 'bg-cream text-ink active:scale-[0.97]'}`}
    >
      {label}
    </button>
  )
}
