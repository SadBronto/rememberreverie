import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

export default function NewWeddingPage() {
  const navigate = useNavigate()
  const tokenRef = useRef<string | null>(null)

  const [coupleEmail, setCoupleEmail]   = useState('')
  const [coupleNames, setCoupleNames]   = useState('')   // optional admin reference
  const [weddingDate, setWeddingDate]   = useState('')   // optional admin reference
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!coupleEmail.trim()) { setError('Couple email is required.'); return }
    setError(null)
    setSaving(true)

    if (!tokenRef.current && supabase) {
      const { data: { session } } = await supabase.auth.getSession()
      tokenRef.current = session?.access_token ?? null
    }

    if (!tokenRef.current) { navigate('/admin/login', { replace: true }); return }

    const res = await fetch('/api/admin/weddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}` },
      body: JSON.stringify({
        coupleEmail: coupleEmail.trim().toLowerCase(),
        coupleNames: coupleNames.trim() || undefined,
        weddingDate: weddingDate || undefined,
      }),
    })

    setSaving(false)

    if (res.status === 401) { navigate('/admin/login', { replace: true }); return }
    if (!res.ok) { setError('Failed to create wedding. Try again.'); return }

    const data = await res.json()
    navigate(`/admin/weddings/${data.id}`)
  }

  return (
    <div className="min-h-dvh bg-ink">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-ink/90 backdrop-blur-md border-b border-cream/5 px-5 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/admin/weddings')} className="text-cream/40 text-sans text-sm touch-manipulation">
          ← Back
        </button>
        <h1 className="text-serif text-cream text-lg font-normal">New Wedding</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-5 py-6 flex flex-col gap-6 max-w-lg">

        {/* Info callout */}
        <div className="bg-cream/[0.04] border border-cream/10 rounded-xl px-4 py-3.5">
          <p className="text-sans text-cream/60 text-sm leading-relaxed">
            Enter the couple's email address. They'll receive a setup link where they configure everything — names, date, camera modes, and more.
          </p>
        </div>

        <Section label="Required">
          <Field label="Couple email" hint="They'll use this to log in and set up their wedding">
            <Input
              type="email"
              value={coupleEmail}
              onChange={v => setCoupleEmail(v)}
              placeholder="couple@email.com"
              required
              autoFocus
            />
          </Field>
        </Section>

        <Section label="Admin reference (optional)">
          <p className="text-mono text-cream/20 text-[10px] tracking-wide -mt-1">
            Only visible to you — the couple will set their own names and date.
          </p>
          <Field label="Couple names">
            <Input
              value={coupleNames}
              onChange={v => setCoupleNames(v)}
              placeholder="Sophia & James"
            />
          </Field>
          <Field label="Wedding date">
            <Input
              type="date"
              value={weddingDate}
              onChange={v => setWeddingDate(v)}
            />
          </Field>
        </Section>

        {error && (
          <p className="text-sans text-sm text-red-400/80">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || !coupleEmail.trim()}
          className="w-full py-4 rounded-full bg-cream text-ink text-sans text-sm font-medium tracking-widest uppercase active:scale-[0.97] transition-transform disabled:opacity-40"
        >
          {saving ? 'Creating…' : 'Create Wedding'}
        </button>
      </form>
    </div>
  )
}

// ── Shared form primitives ───────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-mono text-cream/25 text-[9px] tracking-[0.3em] uppercase mb-3">{label}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <label className="text-sans text-cream/60 text-xs">{label}</label>
        {hint && <span className="text-mono text-cream/25 text-[10px]">{hint}</span>}
      </div>
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
