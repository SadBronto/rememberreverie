import { Link } from 'react-router-dom'

// Public Terms of Service. Plain-language starting template covering the main bases
// for a self-serve event photo-sharing service. Review with a lawyer before relying
// on it, and update the entity name once the LLC is formed.
export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-ink text-cream safe-top safe-bottom">
      <div className="mx-auto w-full max-w-2xl px-6 py-14">
        <p className="text-mono text-[10px] tracking-[0.4em] text-amber-film/70 uppercase">Remember Reverie</p>
        <h1 className="text-serif text-cream font-normal mt-3" style={{ fontSize: 'clamp(2rem, 7vw, 2.8rem)' }}>
          Terms of Service
        </h1>
        <p className="text-mono text-cream/35 text-[11px] tracking-wide mt-3">Last updated October 3, 2026</p>

        <div className="mt-10 flex flex-col gap-7">
          <Lead>
            These Terms govern your use of Reverie, an event photo-sharing service operated by
            Remember Reverie (&ldquo;Reverie,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;). By using the service, whether
            as an event host or as a guest taking photos, you agree to these Terms. If you do not
            agree, do not use the service.
          </Lead>

          <Section n="1" title="What Reverie is">
            Reverie lets an event host invite guests to take photos on their own phones. Those
            photos develop into a private gallery for the host and, for some events, appear on a
            live screen at the event. Features, pricing, and availability may change.
          </Section>

          <Section n="2" title="Who can use it">
            To set up or host an event you must be at least 18 and able to form a binding contract.
            Guests may use a host&rsquo;s event camera through the link or code the host shares. Hosts
            are responsible for how their guests use the service at their event.
          </Section>

          <Section n="3" title="Your photos and the permission you give">
            You keep ownership of the photos you take. By submitting a photo, you grant the host of
            that event and Remember Reverie a non-exclusive license to store it, display it (including
            on screens at the event), and make it available to the host to view and download, for the
            purpose of operating the service. You represent that you have the right to share each
            photo and that you have the consent of any identifiable person in it.
          </Section>

          <Section n="4" title="Acceptable use">
            Do not upload or share content that is illegal, infringing, harassing, hateful, sexually
            explicit, violent, or otherwise objectionable, and do not misuse, overload, or attempt to
            disrupt the service. The host and Remember Reverie may remove any content and may block
            access, at their discretion and without notice. You are responsible for the content you
            submit.
          </Section>

          <Section n="5" title="Content moderation">
            We use automated screening and allow hosts and their staff to review and remove photos.
            Screening is not perfect and we do not guarantee that all objectionable content is
            detected or removed, or that acceptable content is never removed in error.
          </Section>

          <Section n="6" title="If you are a host">
            You control your event settings and your gallery. You are responsible for your guests&rsquo;
            use of the service, for obtaining any consents and permissions required at your venue
            (including any photography, privacy, or venue rules that apply), and for complying with
            applicable laws. You agree to use the photos only in lawful ways.
          </Section>

          <Section n="7" title="Privacy">
            Our handling of photos and personal information is described in our{' '}
            <Link to="/privacy" className="text-amber-film/80 underline hover:text-amber-film">Privacy Policy</Link>.
          </Section>

          <Section n="8" title="Payments and refunds">
            Any fees are shown before purchase and are processed by our third-party payment provider.
            Unless stated otherwise at checkout, a host may request a full refund before the event
            date; after the event, fees are non-refundable except where we fail to provide the
            service. Taxes may apply.
          </Section>

          <Section n="9" title="Data retention">
            Photos and event links are kept for a limited time and are then deleted, as described at
            setup and in the host&rsquo;s dashboard. Download anything you want to keep before it expires.
            We are not responsible for content lost after its retention period or due to an outage.
          </Section>

          <Section n="10" title="Disclaimers">
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind to
            the fullest extent permitted by law. We do not warrant that the service will be
            uninterrupted, error-free, or secure, or that photos will always be available or
            retained.
          </Section>

          <Section n="11" title="Limitation of liability">
            To the fullest extent permitted by law, Remember Reverie will not be liable for any
            indirect, incidental, special, or consequential damages, or for lost photos, data, or
            profits. Our total liability for any claim relating to the service will not exceed the
            amount you paid us for it in the three months before the claim (or, if you paid nothing,
            one hundred U.S. dollars).
          </Section>

          <Section n="12" title="Indemnification">
            You agree to indemnify and hold harmless Remember Reverie from claims, damages, and
            expenses arising out of the content you submit or your use of the service in breach of
            these Terms.
          </Section>

          <Section n="13" title="Changes and termination">
            We may modify, suspend, or discontinue the service or these Terms at any time. If we make
            material changes to these Terms, we will update the date above. Your continued use after a
            change means you accept it. We may suspend or terminate access for any violation of these
            Terms.
          </Section>

          <Section n="14" title="Governing law">
            These Terms are governed by the laws of the State of Washington, USA, without regard to
            its conflict-of-laws rules. Any disputes will be handled in the state or federal courts
            located in Washington.
          </Section>

          <Section n="15" title="Contact">
            Questions about these Terms?{' '}
            <a href="mailto:hello@rememberreverie.com" className="text-amber-film/80 underline hover:text-amber-film">hello@rememberreverie.com</a>.
          </Section>
        </div>

        <div className="mt-12 pt-6 border-t border-cream/10 flex items-center gap-4">
          <Link to="/privacy" className="text-mono text-cream/40 text-[10px] tracking-[0.2em] uppercase hover:text-cream/70">Privacy</Link>
          <span className="text-cream/15">·</span>
          <a href="mailto:hello@rememberreverie.com" className="text-mono text-cream/40 text-[10px] tracking-[0.2em] uppercase hover:text-cream/70">Contact</a>
        </div>
      </div>
    </div>
  )
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="text-sans text-cream/70 text-[15px] leading-relaxed font-light">{children}</p>
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-serif text-cream text-lg font-normal">
        <span className="text-amber-film/50 text-sm mr-2">{n}</span>{title}
      </h2>
      <p className="text-sans text-cream/55 text-sm leading-relaxed font-light">{children}</p>
    </section>
  )
}
