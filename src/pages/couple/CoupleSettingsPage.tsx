import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

interface WeddingSettings {
  couple_names:      string
  wedding_date:      string
  welcome_message:   string
  allowed_modes:     string[]
  annotation_mode:   string
  timestamp_enabled: boolean
  timestamp_style:   string
  slug:              string | null
}

const MODES = [
  { id: 'disposable', label: 'Disposable' },
  { id: 'polaroid',   label: 'Polaroid'   },
  { id: 'super8',     label: 'Super 8'    },
]

export default function CoupleSettingsPage() {
  const { weddingId } = useParams<{ weddingId: string }>()
  const navigate       = useNavigate()
  const tokenRef       = useRef<string | null>(null)

  const [form, setForm]       = useState<WeddingSettings | null>(null)
  const [noDate, setNoDate]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState<'saved' | 'error' | string | null>(null)

  useEffect(() => {
    async function load() {
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/couple/login', { replace: true }); return }
      tokenRef.current = session.access_token

      const res = await fetch('/api/couple/wedding', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { navigate(`/couple/${weddingId}`, { replace: true }); return }
      const data = await res.json()
      setForm({
        couple_names:      data.couple_names      ?? '',
        wedding_date:      data.wedding_date       ?? '',
        welcome_message:   data.welcome_message    ?? '',
        allowed_modes:     data.allowed_modes      ?? ['disposable'],
        annotation_mode:   data.annotation_mode    ?? 'signature',
        timestamp_enabled: data.timestamp_enabled  ?? true,
        timestamp_style:   data.timestamp_style    ?? 'classic',
        slug:              data.slug               ?? null,
      })
      setNoDate(!data.wedding_date)
      setLoading(false)
    }
    load()
  }, [weddingId, navigate])

  function setField<K extends keyof WeddingSettings>(key: K, value: WeddingSettings[K]) {
    setForm(f => f ? { ...f, [key]: value } : f)
  }

  function toggleMode(mode: string) {
    if (!form) return
    const current = form.allowed_modes
    setField('allowed_modes',
      current.includes(mode)
        ? current.filter(m => m !== mode)
        : [...current, mode]
    )
  }

  async function save() {
    if (!form || !tokenRef.current) return
    if (!form.couple_names.trim()) {
      setSaveMsg('Names are required.')
      return
    }
    if (form.allowed_modes.length === 0) {
      setSaveMsg('Select at least one camera style.')
      return
    }

    setSaving(true)
    setSaveMsg(null)

    const res = await fetch('/api/couple/setup', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenRef.current}`,
      },
      body: JSON.stringify({
        coupleNames:      form.couple_names,
        weddingDate:      noDate ? null : form.wedding_date,
        welcomeMessage:   form.welcome_message,
        allowedModes:     form.allowed_modes,
        annotationMode:   form.annotation_mode,
        timestampEnabled: form.timestamp_enabled,
        timestampStyle:   form.timestamp_style,
        slug:             form.slug || null,
      }),
    })

    setSaving(false)

    if (res.ok) {
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 2500)
    } else {
      const text = await res.text()
      setSaveMsg(text || 'Something went wrong — try again.')
    }
  }

  if (loading) return (
    <div className="min-h-dvh bg-ink flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
    </div>
  )

  if (!form) return null

  return (
    <div className="min-h-dvh bg-ink pb-16">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(`/couple/${weddingId}`)}
          className="text-cream/40 text-sans text-sm touch-manipulation"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h1 className="text-serif text-cream text-lg font-normal">Settings</h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-full bg-cream text-ink text-sans text-xs font-medium tracking-widest uppercase touch-manipulation active:scale-95 disabled:opacity-40 transition-all"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="px-5 py-6 flex flex-col gap-6 max-w-lg">

        {saveMsg === 'saved' && (
          <div className="bg-green-400/10 border border-green-400/20 rounded-xl px-4 py-3">
            <p className="text-sans text-green-400/80 text-sm">Settings saved.</p>
          </div>
        )}
        {saveMsg && saveMsg !== 'saved' && (
          <div className="bg-red-400/10 border border-red-400/20 rounded-xl px-4 py-3">
            <p className="text-sans text-red-400/80 text-sm">{saveMsg}</p>
          </div>
        )}

        {/* Names & date */}
        <Section label="Your wedding">
          <Field label="Names">
            <Input
              value={form.couple_names}
              onChange={v => setField('couple_names', v)}
              placeholder="Corey and Stephanie"
            />
          </Field>
          <Field label="Date">
            {!noDate && (
              <Input
                type="date"
                value={form.wedding_date}
                onChange={v => setField('wedding_date', v)}
              />
            )}
            <label className="flex items-center gap-3 cursor-pointer touch-manipulation mt-1">
              <Toggle value={noDate} onChange={v => { setNoDate(v); if (v) setField('wedding_date', '') }} />
              <span className="text-sans text-cream/50 text-sm">No set date / ongoing event</span>
            </label>
          </Field>
          <Field label="Welcome message">
            <Input
              value={form.welcome_message}
              onChange={v => setField('welcome_message', v)}
              placeholder="Leave us a memory."
            />
            <p className="text-mono text-cream/25 text-[10px] leading-relaxed mt-1">
              Shown to guests on the camera landing page.
            </p>
          </Field>
        </Section>

        {/* Camera styles */}
        <Section label="Camera styles">
          <div className="flex gap-2 flex-wrap">
            {MODES.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMode(m.id)}
                className={`px-4 py-2.5 rounded-xl border text-sans text-sm tracking-wide transition-colors touch-manipulation ${
                  form.allowed_modes.includes(m.id)
                    ? 'bg-cream text-ink border-cream'
                    : 'text-cream/40 border-cream/15'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Annotation */}
        <Section label="Guest signing">
          <div className="flex flex-col gap-2">
            {(['signature', 'doodle', 'disabled'] as const).map(opt => (
              <label key={opt} className="flex items-center gap-3 cursor-pointer touch-manipulation">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    form.annotation_mode === opt ? 'border-cream' : 'border-cream/25'
                  }`}
                  onClick={() => setField('annotation_mode', opt)}
                >
                  {form.annotation_mode === opt && (
                    <div className="w-2 h-2 rounded-full bg-cream" />
                  )}
                </div>
                <span className="text-sans text-cream/70 text-sm capitalize">{opt}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* Timestamp */}
        <Section label="Date stamp">
          <div className="flex items-center gap-3">
            <Toggle
              value={form.timestamp_enabled}
              onChange={v => setField('timestamp_enabled', v)}
            />
            <span className="text-sans text-cream/50 text-sm">
              {form.timestamp_enabled ? 'On' : 'Off'}
            </span>
          </div>
          {form.timestamp_enabled && (
            <div className="flex gap-2 mt-3">
              {(['classic', 'vertical', 'elegant'] as const).map(style => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setField('timestamp_style', style)}
                  className={`px-3 py-2 rounded-lg border text-sans text-xs capitalize tracking-wide transition-colors touch-manipulation ${
                    form.timestamp_style === style
                      ? 'bg-cream text-ink border-cream'
                      : 'text-cream/40 border-cream/15'
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Vanity URL */}
        <Section label="Your URL">
          <Field label="Custom link">
            <div className="flex items-center gap-2">
              <span className="text-mono text-cream/25 text-[11px] shrink-0">rememberreverie.com/</span>
              <input
                value={form.slug ?? ''}
                onChange={e => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') || null)}
                placeholder="corey-and-stephanie"
                className="flex-1 bg-ink-light border border-cream/10 rounded-lg px-3 py-2 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
              />
            </div>
            {form.slug && (
              <p className="text-mono text-cream/25 text-[10px] mt-1 leading-relaxed">
                Slideshow: slideshow.rememberreverie.com/{form.slug}
              </p>
            )}
          </Field>
        </Section>

        {/* Save button (bottom) */}
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase touch-manipulation active:scale-[0.98] disabled:opacity-40 transition-all"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase">{label}</p>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sans text-cream/45 text-xs">{label}</label>
      {children}
    </div>
  )
}

function Input({ onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange: (v: string) => void }) {
  return (
    <input
      {...props}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-ink-light border border-cream/10 rounded-xl px-4 py-3 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25 transition-colors"
    />
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-12 h-6 rounded-full transition-colors touch-manipulation shrink-0 ${value ? 'bg-cream' : 'bg-cream/15'}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${value ? 'left-7 bg-ink' : 'left-1 bg-cream/40'}`} />
    </button>
  )
}
