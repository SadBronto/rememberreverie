import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { flushPendingUploads } from '@/lib/recovery'
import SlideshowSlugPage from '@/pages/SlideshowSlugPage'
import LandingPage from '@/pages/LandingPage'
import CameraPage from '@/pages/CameraPage'
import AnnotatePage from '@/pages/AnnotatePage'
import ConfirmationPage from '@/pages/ConfirmationPage'
import DemoLandingPage from '@/pages/demo/DemoLandingPage'
import DemoSetupPage from '@/pages/demo/DemoSetupPage'
import DemoGalleryPage from '@/pages/demo/DemoGalleryPage'
import LoginPage from '@/pages/couple/LoginPage'
import AuthCallbackPage from '@/pages/couple/AuthCallbackPage'
import CoupleSetupPage from '@/pages/couple/CoupleSetupPage'
import CoupleGalleryPage from '@/pages/couple/GalleryPage'
import CoupleSettingsPage from '@/pages/couple/CoupleSettingsPage'
import NoWeddingPage from '@/pages/couple/NoWeddingPage'
import AdminLoginPage from '@/pages/admin/AdminLoginPage'
import WeddingsPage from '@/pages/admin/WeddingsPage'
import NewWeddingPage from '@/pages/admin/NewWeddingPage'
import WeddingDetailPage from '@/pages/admin/WeddingDetailPage'
import AdminGalleryPage from '@/pages/admin/AdminGalleryPage'
import PrintSignPage from '@/pages/admin/PrintSignPage'
import SlugPage from '@/pages/SlugPage'
import SlideshowPage from '@/pages/SlideshowPage'
import SignatureLabPage from '@/pages/SignatureLabPage'
import PrivacyPage from '@/pages/PrivacyPage'

// Route structure:
// /                      — demo landing (primary entry point for sales)
// /demo/setup            — demo setup wizard (names, date, memory style)
// /demo/gallery          — demo gallery reveal
// /w/:weddingId          — real guest landing page (QR code destination)
// /w/:weddingId/camera   — camera experience (shared by demo + real)
// /w/:weddingId/annotate — signature/doodle screen (Polaroid mode only)
// /w/:weddingId/done     — confirmation screen
// /couple/login          — couple magic-link login
// /auth/callback         — Supabase auth redirect handler
// /couple/:weddingId     — couple photo gallery (authenticated)

export default function App() {
  // Retry any photos stranded by a bad connection — the moment the device comes
  // back online, and whenever the app returns to the foreground. Previously this
  // only fired when the camera screen mounted, so a guest who reconnected but
  // didn't reopen the camera could sit with an un-uploaded photo indefinitely.
  useEffect(() => {
    const flush = () => { void flushPendingUploads() }
    flush() // also catch anything pending from a previous session on first load
    window.addEventListener('online', flush)
    const onVisible = () => { if (document.visibilityState === 'visible') flush() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // slideshow.rememberreverie.com/:slug → resolve slug and show slideshow directly
  if (window.location.hostname === 'slideshow.rememberreverie.com') {
    const slug = window.location.pathname.replace(/^\/+|\/+$/g, '')
    return <SlideshowSlugPage slug={slug} />
  }

  return (
    <Routes>
      <Route path="/" element={<DemoLandingPage />} />
      <Route path="/demo/setup" element={<DemoSetupPage />} />
      <Route path="/demo/gallery" element={<DemoGalleryPage />} />
      <Route path="/w/:weddingId" element={<LandingPage />} />
      <Route path="/w/:weddingId/camera" element={<CameraPage />} />
      <Route path="/w/:weddingId/annotate" element={<AnnotatePage />} />
      <Route path="/w/:weddingId/done" element={<ConfirmationPage />} />
      <Route path="/w/:weddingId/slideshow" element={<SlideshowPage />} />
      <Route path="/couple/login" element={<LoginPage />} />
      <Route path="/couple/setup" element={<CoupleSetupPage />} />
      <Route path="/couple/no-wedding" element={<NoWeddingPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/couple/:weddingId" element={<CoupleGalleryPage />} />
      <Route path="/couple/:weddingId/settings" element={<CoupleSettingsPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/weddings" element={<WeddingsPage />} />
      <Route path="/admin/weddings/new" element={<NewWeddingPage />} />
      <Route path="/admin/weddings/:id" element={<WeddingDetailPage />} />
      <Route path="/admin/weddings/:id/gallery" element={<AdminGalleryPage />} />
      <Route path="/admin/weddings/:id/print" element={<PrintSignPage />} />
      <Route path="/admin/signature-lab" element={<SignatureLabPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {/* Vanity slug — must be last; only matches single-segment paths not caught above */}
      <Route path="/:slug" element={<SlugPage />} />
    </Routes>
  )
}
