import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { portalBase } from '@/lib/portalNav'
import { isDemoId } from '@/demo/demoConfig'
import { useDemoStore } from '@/store/demoStore'
import ScreenPrivacy from '@/components/ScreenPrivacy'
import WatermarkManager from '@/components/WatermarkManager'
import SlidesManager from '@/components/SlidesManager'
import type { CameraModeName, WeddingConfig } from '@/types/session'
import { useFreshToken } from '@/lib/useFreshToken'

const GeofenceMap = lazy(() => import('@/components/GeofenceMap'))

interface Extra {
  staffCode: string
  qrOn: boolean; qrEvery: number; qrSeconds: number
  spotlight: boolean
  addonGeofence: boolean
  geoOn: boolean; geoLat: number | null; geoLng: number | null; geoRadius: number; geoBypass: string
  plan: string
  screen: { state: string; seenAt: number | null; advancedAt: number | null } | null
}
const EXTRA_DEFAULT: Extra = {
  staffCode: '', qrOn: false, qrEvery: 10, qrSeconds: 12, spotlight: false,
  addonGeofence: false, geoOn: false, geoLat: null, geoLng: null, geoRadius: 150, geoBypass: '',
  plan: 'basic', screen: null,
}

function agoText(ms: number | null): string {
  if (ms == null) return 'never'
  const m = Math.round((Date.now() - ms) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`
}

interface WeddingSettings {
  couple_names:      string
  wedding_date:      string
  welcome_message:   string
  allowed_modes:     string[]
  annotation_mode:   string
  selfie_enabled:    boolean
  timestamp_enabled: boolean
  timestamp_style:   string
  timestamp_size:    string
  timestamp_outline: string
  slug:              string | null
}

const MODES = [
  { id: 'disposable', label: 'Disposable' },
  { id: 'polaroid',   label: 'Polaroid'   },
  { id: 'super8',     label: 'Super 8'    },
  { id: 'noir',       label: 'Noir'       },
  { id: 'flash',      label: 'Flash'      },
  { id: 'champagne',  label: 'Champagne'  },
]

export default function CoupleSettingsPage() {
  const { weddingId } = useParams<{ weddingId: string }>()
  const navigate       = useNavigate()
  const tokenRef       = useRef<string | null>(null)
  useFreshToken(tokenRef)
  const demo           = isDemoId(weddingId)
  const demoConfig     = useDemoStore((s) => s.config)
  const applySetup     = useDemoStore((s) => s.applySetup)

  const [form, setForm]       = useState<WeddingSettings | null>(null)
  const [extra, setExtra] = useState<Extra>(EXTRA_DEFAULT)
  function setX<K extends keyof Extra>(k: K, v: Extra[K]) { setExtra(e => ({ ...e, [k]: v })) }
  const [noDate, setNoDate]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saveMsg, setSaveMsg] = useState<'saved' | 'error' | string | null>(null)

  useEffect(() => {
    // Demo mode: load from the demo store, no auth/backend.
    if (demo) {
      setForm({
        couple_names:      demoConfig.coupleNames,
        wedding_date:      demoConfig.weddingDate ?? '',
        welcome_message:   demoConfig.welcomeMessage,
        allowed_modes:     demoConfig.allowedModes,
        annotation_mode:   demoConfig.annotationMode,
        selfie_enabled:    demoConfig.selfieEnabled ?? true,
        timestamp_enabled: demoConfig.timestampEnabled,
        timestamp_style:   demoConfig.timestampStyle,
        timestamp_size:    demoConfig.timestampSize ?? 'medium',
        timestamp_outline: demoConfig.timestampOutline ?? 'medium',
        slug:              null,
      })
      setNoDate(!demoConfig.weddingDate)
      setLoading(false)
      return
    }

    async function load() {
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate(`${portalBase()}/login`, { replace: true }); return }
      tokenRef.current = session.access_token

      const res = await fetch('/api/host/wedding', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { navigate(`${portalBase()}/${weddingId}`, { replace: true }); return }
      const data = await res.json()
      setForm({
        couple_names:      data.couple_names      ?? '',
        wedding_date:      data.wedding_date       ?? '',
        welcome_message:   data.welcome_message    ?? '',
        allowed_modes:     data.allowed_modes      ?? ['disposable'],
        annotation_mode:   data.annotation_mode    ?? 'signature',
        selfie_enabled:    data.selfie_enabled     ?? true,
        timestamp_enabled: data.timestamp_enabled  ?? true,
        timestamp_style:   data.timestamp_style    ?? 'classic',
        timestamp_size:    data.timestamp_size     ?? 'medium',
        timestamp_outline: data.timestamp_outline  ?? 'medium',
        slug:              data.slug               ?? null,
      })
      setNoDate(!data.wedding_date)
      setExtra({
        staffCode: data.staff_code ?? '',
        qrOn: !!data.slideshow_qr_slide, qrEvery: data.slideshow_qr_every ?? 10, qrSeconds: data.slideshow_qr_seconds ?? 12,
        spotlight: !!data.slideshow_spotlight_new,
        addonGeofence: !!data.addon_geofence,
        geoOn: !!data.geofence_enabled, geoLat: data.geofence_lat ?? null, geoLng: data.geofence_lng ?? null,
        geoRadius: data.geofence_radius_m ?? 150, geoBypass: data.geofence_bypass_code ?? '',
        plan: data.plan ?? 'basic', screen: data.screen ?? null,
      })
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
    if (!form) return
    if (!demo && !tokenRef.current) return
    if (!form.couple_names.trim()) {
      setSaveMsg('Names are required.')
      return
    }
    if (form.allowed_modes.length === 0) {
      setSaveMsg('Select at least one camera style.')
      return
    }

    // Demo mode: apply to the demo store so changes show up in the Guest flow /
    // Client gallery; no backend write.
    if (demo) {
      const overrides: Partial<WeddingConfig> = {
        coupleNames:      form.couple_names,
        weddingDate:      noDate ? null : form.wedding_date,
        welcomeMessage:   form.welcome_message,
        allowedModes:     form.allowed_modes as CameraModeName[],
        annotationMode:   form.annotation_mode as WeddingConfig['annotationMode'],
        selfieEnabled:    form.selfie_enabled,
        timestampEnabled: form.timestamp_enabled,
        timestampStyle:   form.timestamp_style as WeddingConfig['timestampStyle'],
        timestampSize:    form.timestamp_size as WeddingConfig['timestampSize'],
        timestampOutline: form.timestamp_outline as WeddingConfig['timestampOutline'],
      }
      applySetup(overrides)
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 2500)
      return
    }

    setSaving(true)
    setSaveMsg(null)

    const res = await fetch('/api/host/setup', {
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
        timestampSize:    form.timestamp_size,
        timestampOutline: form.timestamp_outline,
        selfieEnabled:    form.selfie_enabled,
        slug:             form.slug || null,
        staffCode:        extra.staffCode,
        qrSlideEnabled:   extra.qrOn,
        qrEvery:          extra.qrEvery,
        qrSeconds:        extra.qrSeconds,
        spotlightNew:     extra.spotlight,
        ...(extra.addonGeofence ? { geofence: {
          enabled: extra.geoOn, lat: extra.geoLat, lng: extra.geoLng, radiusM: extra.geoRadius, bypassCode: extra.geoBypass || null,
        } } : {}),
      }),
    })

    setSaving(false)

    if (res.ok) {
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 2500)
    } else {
      const text = await res.text()
      setSaveMsg(text || 'Something went wrong. Try again.')
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
          onClick={() => navigate(`${portalBase()}/${weddingId}`)}
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
        <Section label="Your event">
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

        {/* Selfie / front camera */}
        <Section label="Selfie">
          <div className="flex items-center gap-3">
            <Toggle value={form.selfie_enabled} onChange={v => setField('selfie_enabled', v)} />
            <span className="text-sans text-cream/50 text-sm">
              {form.selfie_enabled ? 'Front camera on' : 'Rear camera only'}
            </span>
          </div>
          <p className="text-mono text-cream/25 text-[10px] leading-relaxed">
            Lets guests flip to the front camera for selfies. Same no-retake rule and film look as the rear camera.
          </p>
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
          {form.timestamp_enabled && (
            <div className="mt-3">
              <p className="text-mono text-cream/40 text-[10px] tracking-wide uppercase mb-2">Size</p>
              <div className="flex gap-2">
                {(['small', 'medium', 'large'] as const).map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setField('timestamp_size', sz)}
                    className={`px-3 py-2 rounded-lg border text-sans text-xs capitalize tracking-wide transition-colors touch-manipulation ${
                      (form.timestamp_size ?? 'medium') === sz
                        ? 'bg-cream text-ink border-cream'
                        : 'text-cream/40 border-cream/15'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          )}
          {form.timestamp_enabled && form.timestamp_style === 'elegant' && (
            <div className="mt-3">
              <p className="text-mono text-cream/40 text-[10px] tracking-wide uppercase mb-2">Outline (white stamp)</p>
              <div className="flex gap-2">
                {(['off', 'small', 'medium', 'large'] as const).map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setField('timestamp_outline', o)}
                    className={`px-3 py-2 rounded-lg border text-sans text-xs capitalize tracking-wide transition-colors touch-manipulation ${
                      (form.timestamp_outline ?? 'medium') === o
                        ? 'bg-cream text-ink border-cream'
                        : 'text-cream/40 border-cream/15'
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
              <p className="text-mono text-cream/25 text-[10px] mt-2 leading-relaxed">
                Keeps the white “elegant” stamp legible on bright photos. Classic and Vertical stay raw (like a camera’s date stamp).
              </p>
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

        {/* Screen status (Reverie Live) */}
        {!demo && extra.plan === 'live' && extra.screen && (() => {
          const st = extra.screen.state
          const tone = st === 'ok' ? 'bg-green-400' : st === 'offline' || st === 'stalled' ? 'bg-red-400' : 'bg-cream/30'
          const headline =
            st === 'ok' ? 'Your screen is online'
            : st === 'offline' ? 'Your screen looks offline'
            : st === 'stalled' ? 'Your screen is on but not changing slides'
            : st === 'closed' ? 'Outside the hours we watch your screen'
            : 'We have not seen your screen yet'
          return (
            <Section label="Screen status">
              <div className="flex items-start gap-3 bg-ink-light border border-cream/10 rounded-xl px-4 py-3">
                <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${tone}`} />
                <div>
                  <p className="text-sans text-cream/80 text-sm">{headline}</p>
                  <p className="text-mono text-cream/35 text-[10px] mt-1">
                    Last check-in {agoText(extra.screen.seenAt)} &middot; last slide change {agoText(extra.screen.advancedAt)}
                  </p>
                  {(st === 'offline' || st === 'stalled') && (
                    <p className="text-sans text-cream/45 text-xs mt-2 leading-relaxed">
                      Check that the TV is on and the streaming stick is plugged in. Unplug the stick for 10 seconds and plug it back in.
                    </p>
                  )}
                </div>
              </div>
              <p className="text-mono text-cream/25 text-[10px]">Updates when you open this page. The screen checks in every 30 seconds to 5 minutes.</p>
            </Section>
          )
        })()}

        {/* Slideshow options */}
        {!demo && extra.plan === 'live' && (
          <Section label="Slideshow options">
            <div className="flex items-center gap-3">
              <Toggle value={extra.qrOn} onChange={v => setX('qrOn', v)} />
              <span className="text-sans text-cream/60 text-sm">Show a &ldquo;Scan to share&rdquo; slide</span>
            </div>
            {extra.qrOn && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 items-center text-sans text-cream/60 text-xs">
                <label className="flex items-center gap-2">Every
                  <input type="number" min={1} max={50} value={extra.qrEvery}
                    onChange={e => setX('qrEvery', Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className="w-14 bg-ink-light border border-cream/15 rounded-lg px-2 py-1 text-cream text-center focus:outline-none" />
                  photos
                </label>
                <label className="flex items-center gap-2">For
                  <input type="number" min={3} max={60} value={extra.qrSeconds}
                    onChange={e => setX('qrSeconds', Math.max(3, Math.min(60, Number(e.target.value) || 3)))}
                    className="w-14 bg-ink-light border border-cream/15 rounded-lg px-2 py-1 text-cream text-center focus:outline-none" />
                  seconds
                </label>
              </div>
            )}
            <div className="flex items-center gap-3 mt-1">
              <Toggle value={extra.spotlight} onChange={v => setX('spotlight', v)} />
              <span className="text-sans text-cream/60 text-sm">Show new photos right away</span>
            </div>
            <p className="text-mono text-cream/25 text-[10px] leading-relaxed">
              A new photo plays next on the screen (after it passes screening) instead of waiting its turn. With only a few photos, the scan slide plays once each time the show loops. Press Save Settings below to apply.
            </p>
          </Section>
        )}

        {!demo && form.slug && (
          <Section label="Staff page">
            <p className="text-sans text-cream/50 text-xs leading-relaxed">
              For your on-site staff: they sign in with this password to remove any photo from the screen.
            </p>
            <p className="text-mono text-cream/40 text-[11px]">rememberreverie.com/staff/{form.slug}</p>
            <Field label="Staff password (6 or more characters)">
              <input
                value={extra.staffCode} onChange={e => setX('staffCode', e.target.value)}
                placeholder="Choose a password"
                className="w-full bg-ink-light border border-cream/10 rounded-lg px-3 py-2 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25"
              />
            </Field>
            <a
              href={`/staff/${form.slug}`} target="_blank" rel="noreferrer"
              className="self-start px-4 py-2 rounded-full border border-cream/20 text-cream/70 text-sans text-xs tracking-widest uppercase"
            >
              Open staff page
            </a>
            <p className="text-mono text-cream/25 text-[10px]">Press Save Settings below to change the password.</p>
          </Section>
        )}

        {/* Location fence (only if the geofence add-on is on) */}
        {!demo && extra.addonGeofence && (
          <Section label="Location fence">
            <div className="flex items-center gap-3">
              <Toggle value={extra.geoOn} onChange={v => setExtra(e => ({ ...e, geoOn: v, geoRadius: v && !e.geoRadius ? 150 : e.geoRadius }))} />
              <span className="text-sans text-cream/60 text-sm">{extra.geoOn ? 'Guests must be at the venue to take photos' : 'Off'}</span>
            </div>
            {extra.geoOn && (
              <div className="flex flex-col gap-3">
                <Suspense fallback={<div className="w-full h-64 rounded-xl bg-ink-light border border-cream/10 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" /></div>}>
                  <GeofenceMap lat={extra.geoLat} lng={extra.geoLng} radius={extra.geoRadius}
                    onMove={(la, lo) => setExtra(e => ({ ...e, geoLat: la, geoLng: lo }))} />
                </Suspense>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sans text-cream/50 text-xs">Fence size</label>
                    <span className="text-mono text-cream/50 text-[11px]">{extra.geoRadius} m &middot; about {Math.round(extra.geoRadius * 3.28084)} ft</span>
                  </div>
                  <input type="range" min={25} max={1000} step={25} value={extra.geoRadius}
                    onChange={e => setX('geoRadius', Number(e.target.value))} className="w-full accent-amber-500" />
                  <p className="text-mono text-cream/25 text-[10px] leading-relaxed">Phone GPS indoors can drift 30 to 100 m. Keep it generous (150 m or more) so real guests are not blocked.</p>
                </div>
                {extra.geoLat == null && <p className="text-sans text-amber-400/80 text-xs">Tap the map to set the venue location before saving.</p>}
                <Field label="Bypass code (optional)">
                  <input value={extra.geoBypass} onChange={e => setX('geoBypass', e.target.value)} placeholder="For guests whose location cannot be checked"
                    className="w-full bg-ink-light border border-cream/10 rounded-lg px-3 py-2 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25" />
                </Field>
                <p className="text-mono text-cream/25 text-[10px]">Press Save Settings below to apply.</p>
              </div>
            )}
          </Section>
        )}

        {!demo && weddingId && <ScreenPrivacy label="Screen privacy" weddingId={weddingId} getToken={() => tokenRef.current} />}
        {!demo && weddingId && <WatermarkManager label="Logo watermark" weddingId={weddingId} getToken={() => tokenRef.current} />}

        {!demo && weddingId && (
          <Section label="Reception slides">
            <SlidesManager weddingId={weddingId} getToken={() => tokenRef.current} />
          </Section>
        )}

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
