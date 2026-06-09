import { Link } from 'react-router-dom'

const CONTACT_URL  = 'https://www.thirddegreeentertainment.com/contact'
const LAST_UPDATED = 'June 9, 2026'

// Privacy policy — also serves as a legitimacy signal for the domain (a real
// business with a clear data policy + contact, not a phishing throwaway).
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-ink text-cream/80 px-6 py-12 safe-top safe-bottom">
      <div className="max-w-2xl mx-auto flex flex-col gap-8">

        <header className="flex flex-col gap-2">
          <Link to="/" className="text-mono text-cream/30 text-[10px] tracking-[0.3em] uppercase hover:text-cream/50 transition-colors">
            ← Reverie
          </Link>
          <h1 className="text-serif text-cream text-3xl font-normal mt-2">Privacy Policy</h1>
          <p className="text-mono text-cream/30 text-[10px] tracking-widest uppercase">Last updated {LAST_UPDATED}</p>
        </header>

        <p className="text-sans text-sm leading-relaxed">
          Reverie is a private photo-sharing service for weddings and events, operated by
          Third Degree Entertainment. A host creates a gallery, guests capture photos through
          their phone's browser, and those photos appear in the host's private gallery and
          (optionally) a live slideshow. This policy explains what we collect, how we use it,
          and your choices.
        </p>

        <Section title="Information we collect">
          <Bullet><b>Account &amp; event details.</b> If you're a host, we collect your email
            address (used for passwordless sign-in), your name or couple names, your event date,
            and the settings you choose for your gallery.</Bullet>
          <Bullet><b>Photos &amp; content.</b> Photos that you or your guests capture, any
            signatures or notes added to them, and basic metadata such as the time a photo was
            taken.</Bullet>
          <Bullet><b>Technical data.</b> Standard server logs (e.g., IP address, browser type)
            used to operate and secure the service.</Bullet>
          <p className="text-sans text-sm leading-relaxed mt-1">
            We do <b>not</b> ask for or store passwords, payment card numbers, or government IDs.
            Sign-in is done entirely through one-time email links.
          </p>
        </Section>

        <Section title="How we use your information">
          <Bullet>To provide the service — creating your gallery, authenticating you, and
            displaying photos in your gallery and slideshow.</Bullet>
          <Bullet>To keep displays appropriate — uploaded photos may be automatically screened
            for explicit content so it can be hidden from public slideshows pending review.</Bullet>
          <Bullet>To communicate with you about your account (for example, sign-in links and
            occasional service notices).</Bullet>
        </Section>

        <Section title="Service providers we use">
          <Bullet><b>Supabase</b> — database, photo storage, and authentication.</Bullet>
          <Bullet><b>Netlify</b> — website and application hosting.</Bullet>
          <Bullet><b>Google Cloud Vision</b> — automated screening of uploaded photos for
            explicit content (content-safety only).</Bullet>
          <Bullet><b>Email delivery (Amazon SES / Resend)</b> — sending one-time sign-in links.</Bullet>
          <p className="text-sans text-sm leading-relaxed mt-1">
            We do not sell your personal information or share it for advertising.
          </p>
        </Section>

        <Section title="Demo imagery">
          <p className="text-sans text-sm leading-relaxed">
            Photographs shown in our product demo are free stock images from{' '}
            <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" className="text-cream underline underline-offset-2">
              Unsplash
            </a>
            {' '}— they are not real customer photos.
          </p>
        </Section>

        <Section title="How long we keep photos">
          <p className="text-sans text-sm leading-relaxed">
            Photos are retained for the life of your event and then deleted — typically around
            90 days after a wedding date, or on the end date set for a non-wedding event. You can
            download your photos any time before then, and you can ask us to delete your data
            sooner.
          </p>
        </Section>

        <Section title="Your choices">
          <Bullet>Download your photos at any time from your gallery.</Bullet>
          <Bullet>Hide or delete individual photos from your gallery.</Bullet>
          <Bullet>Request access to, or deletion of, your account and data by contacting us (see below).</Bullet>
        </Section>

        <Section title="Children">
          <p className="text-sans text-sm leading-relaxed">
            Reverie is intended for adults organizing or attending events and is not directed to
            children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p className="text-sans text-sm leading-relaxed">
            We may update this policy from time to time. Material changes will be reflected by the
            "last updated" date above.
          </p>
        </Section>

        <Section title="Contact">
          <p className="text-sans text-sm leading-relaxed">
            Reverie is operated by Third Degree Entertainment. For questions or requests —
            including access to or deletion of your data — please reach us through{' '}
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="text-cream underline underline-offset-2">
              thirddegreeentertainment.com/contact
            </a>.
          </p>
        </Section>

        <footer className="border-t border-cream/10 pt-6 mt-2">
          <p className="text-mono text-cream/25 text-[10px] tracking-[0.2em] uppercase">
            © {new Date().getFullYear()} Third Degree Entertainment · Reverie
          </p>
        </footer>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-serif text-cream text-lg font-normal">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="text-cream/25 mt-1.5 shrink-0">·</span>
      <p className="text-sans text-sm leading-relaxed">{children}</p>
    </div>
  )
}
