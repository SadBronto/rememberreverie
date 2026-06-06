import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { flushPendingUploads } from '@/lib/recovery'

// ── Guest-critical path: eager, so a guest who scans the QR loads instantly ──
import LandingPage from '@/pages/LandingPage'
import CameraPage from '@/pages/CameraPage'
import AnnotatePage from '@/pages/AnnotatePage'
import ConfirmationPage from '@/pages/ConfirmationPage'
import DemoLandingPage from '@/pages/demo/DemoLandingPage'

// ── Everything else: lazy-loaded on demand (keeps the guest bundle small) ──
const SlideshowSlugPage  = lazy(() => import('@/pages/SlideshowSlugPage'))
const SlideshowPage      = lazy(() => import('@/pages/SlideshowPage'))
const DemoSetupPage      = lazy(() => import('@/pages/demo/DemoSetupPage'))
const DemoGalleryPage    = lazy(() => import('@/pages/demo/DemoGalleryPage'))
const LoginPage          = lazy(() => import('@/pages/couple/LoginPage'))
const AuthCallbackPage   = lazy(() => import('@/pages/couple/AuthCallbackPage'))
const CoupleSetupPage    = lazy(() => import('@/pages/couple/CoupleSetupPage'))
const CoupleGalleryPage  = lazy(() => import('@/pages/couple/GalleryPage'))
const CoupleSettingsPage = lazy(() => import('@/pages/couple/CoupleSettingsPage'))
const CouplePrintPage    = lazy(() => import('@/pages/couple/CouplePrintPage'))
const NoWeddingPage      = lazy(() => import('@/pages/couple/NoWeddingPage'))
const AdminLoginPage     = lazy(() => import('@/pages/admin/AdminLoginPage'))
const WeddingsPage       = lazy(() => import('@/pages/admin/WeddingsPage'))
const NewWeddingPage     = lazy(() => import('@/pages/admin/NewWeddingPage'))
const WeddingDetailPage  = lazy(() => import('@/pages/admin/WeddingDetailPage'))
const AdminGalleryPage   = lazy(() => import('@/pages/admin/AdminGalleryPage'))
const PrintSignPage      = lazy(() => import('@/pages/admin/PrintSignPage'))
const SlugPage           = lazy(() => import('@/pages/SlugPage'))
const SignatureLabPage   = lazy(() => import('@/pages/SignatureLabPage'))
const PrivacyPage        = lazy(() => import('@/pages/PrivacyPage'))

function Loading() {
  return (
    <div className="min-h-dvh bg-ink flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-cream/20 border-t-cream/60 animate-spin" />
    </div>
  )
}

export default function App() {
  // Retry any photos stranded by a bad connection — the moment the device comes
  // back online, and whenever the app returns to the foreground.
  useEffect(() => {
    const flush = () => { void flushPendingUploads() }
    flush()
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
    return (
      <Suspense fallback={<Loading />}>
        <SlideshowSlugPage slug={slug} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<Loading />}>
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
        <Route path="/couple/:weddingId/print" element={<CouplePrintPage />} />
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
    </Suspense>
  )
}
