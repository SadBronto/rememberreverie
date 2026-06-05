import StyledQR from '@/components/StyledQR'
import type { QRSettings } from '@/components/QRCreator'

// Print-ready table sign (US Letter portrait, light background). Shared by the
// admin and couple print routes. Uses the *designed* QR from saved settings.
export default function PrintSignSheet({
  coupleNames,
  dateStr,
  guestUrl,
  qrSettings,
  onBack,
}: {
  coupleNames: string
  dateStr: string
  guestUrl: string
  qrSettings: QRSettings | null
  onBack: () => void
}) {
  return (
    <>
      <style>{`
        @page { size: letter portrait; margin: 0.5in; }
        @media print {
          .ps-toolbar { display: none !important; }
          html, body, #root { background: #ffffff !important; }
          .ps-wrap { background: #ffffff !important; padding: 0 !important; min-height: 0 !important; }
          .ps-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: 9.4in !important; border-radius: 0 !important; }
        }
        .ps-sheet, .ps-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="ps-toolbar sticky top-0 z-10 flex items-center justify-between px-5 py-3 bg-ink/95 backdrop-blur-md border-b border-cream/10">
        <button onClick={onBack} className="text-cream/50 text-sans text-sm">← Back</button>
        <p className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase">Print sign</p>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-full bg-cream text-ink text-sans text-xs font-medium tracking-widest uppercase"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="ps-wrap min-h-dvh py-8 px-4 flex justify-center" style={{ background: '#3a342c' }}>
        <div
          className="ps-sheet"
          style={{
            width: '8.5in',
            minHeight: '11in',
            background: '#ffffff',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '1in 0.85in',
            color: '#2a241c',
          }}
        >
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 400, fontSize: '48px', lineHeight: 1.1, margin: '0 0 6px', color: '#1a1612' }}>
            {coupleNames}
          </h1>

          {dateStr && (
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '12px', letterSpacing: '0.28em', textTransform: 'uppercase', color: '#9a8d76' }}>
              {dateStr}
            </p>
          )}

          <div style={{ width: '56px', height: '1px', background: '#c8b9a0', margin: '30px 0' }} />

          <p style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontWeight: 400, fontSize: '27px', color: '#1a1612', margin: '0 0 18px' }}>
            Every memory tells part of the story.
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', lineHeight: 1.65, color: '#5a5040', maxWidth: '5.3in', margin: '0 0 34px' }}>
            Our photographers will capture the milestones, but the candid moments, shared laughter,
            and little details often come from the people who experience them alongside us. Scan the
            QR code to share your photos and help create a collection of memories we&rsquo;ll cherish
            for years to come.
          </p>

          {/* Designed QR */}
          <div style={{ background: '#ffffff', padding: '22px', borderRadius: '18px', boxShadow: '0 4px 18px rgba(40,28,12,0.12)' }}>
            <StyledQR url={guestUrl} settings={qrSettings} size={300} />
          </div>

          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: '#5a5040', margin: '26px 0 4px' }}>
            Having trouble scanning the QR code? Go to
          </p>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '18px', color: '#1a1612', letterSpacing: '0.02em' }}>
            {guestUrl.replace(/^https?:\/\//, '')}
          </p>
        </div>
      </div>
    </>
  )
}
