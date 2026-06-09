import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Admin-only venue picker. Draggable pin sets the fence center; the shaded circle
// shows the radius. Lazy-loaded so Leaflet never reaches the guest bundle.

const DEFAULT_CENTER: [number, number] = [39.5, -98.35] // geographic centre of the US
const DEFAULT_ZOOM = 4
const PIN_ZOOM = 16

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#e8a23a;border:2px solid #1a1612;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.45)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

export default function GeofenceMap({
  lat, lng, radius, onMove,
}: {
  lat: number | null
  lng: number | null
  radius: number
  onMove: (lat: number, lng: number) => void
}) {
  const elRef     = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  const [query, setQuery]         = useState('')
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState(false)

  // ── Initialise the map once ────────────────────────────────────
  useEffect(() => {
    if (!elRef.current || mapRef.current) return
    const placed = lat != null && lng != null
    const start: [number, number] = placed ? [lat, lng] : DEFAULT_CENTER

    const map = L.map(elRef.current).setView(start, placed ? PIN_ZOOM : DEFAULT_ZOOM)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    const marker = L.marker(start, { draggable: true, icon: pinIcon }).addTo(map)
    const circle = L.circle(start, {
      radius, color: '#e8a23a', weight: 2, fillColor: '#e8a23a', fillOpacity: 0.12,
    }).addTo(map)

    marker.on('dragend', () => {
      const p = marker.getLatLng()
      circle.setLatLng(p)
      onMoveRef.current(p.lat, p.lng)
    })
    map.on('click', (e: L.LeafletMouseEvent) => {
      marker.setLatLng(e.latlng)
      circle.setLatLng(e.latlng)
      onMoveRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map; markerRef.current = marker; circleRef.current = circle
    // Container may have mounted hidden/scrolled — recompute size next tick.
    setTimeout(() => map.invalidateSize(), 60)

    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Radius → circle ────────────────────────────────────────────
  useEffect(() => { circleRef.current?.setRadius(radius) }, [radius])

  // ── External lat/lng change (e.g. from search) → reposition ────
  useEffect(() => {
    if (lat == null || lng == null || !markerRef.current) return
    const p = markerRef.current.getLatLng()
    if (Math.abs(p.lat - lat) < 1e-7 && Math.abs(p.lng - lng) < 1e-7) return
    markerRef.current.setLatLng([lat, lng])
    circleRef.current?.setLatLng([lat, lng])
  }, [lat, lng])

  async function runSearch() {
    if (!query.trim() || searching) return
    setSearching(true); setSearchErr(false)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
      )
      const arr = await res.json()
      if (arr?.[0]) {
        const la = +arr[0].lat, lo = +arr[0].lon
        mapRef.current?.setView([la, lo], PIN_ZOOM)
        markerRef.current?.setLatLng([la, lo])
        circleRef.current?.setLatLng([la, lo])
        onMoveRef.current(la, lo)
      } else setSearchErr(true)
    } catch {
      setSearchErr(true)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
          placeholder="Search venue address…"
          className="flex-1 bg-ink-light border border-cream/10 rounded-lg px-3 py-2 text-cream text-sans text-sm placeholder:text-cream/20 focus:outline-none focus:border-cream/25"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={searching}
          className="px-4 py-2 rounded-lg border border-cream/15 text-cream/60 text-sans text-xs tracking-widest uppercase touch-manipulation disabled:opacity-40"
        >
          {searching ? '…' : 'Find'}
        </button>
      </div>
      {searchErr && (
        <p className="text-sans text-red-400/70 text-xs">Couldn't find that — drop the pin manually instead.</p>
      )}
      <div
        ref={elRef}
        className="w-full h-64 rounded-xl overflow-hidden border border-cream/10"
        style={{ background: '#2a2420' }}
      />
      <p className="text-mono text-cream/25 text-[10px] leading-relaxed">
        Drag the pin (or tap the map) to set the venue. The shaded circle is the fence.
      </p>
    </div>
  )
}
