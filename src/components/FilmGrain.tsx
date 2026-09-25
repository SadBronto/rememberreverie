interface Props {
  opacity?: number
}

// Static film-grain texture (SVG fractal noise), tiled — identical to the home
// page's background. Intentionally NOT animated: moving grain reads as a flickery
// "video static" effect, which the client rejected. One overlay, no canvas, no
// requestAnimationFrame. Drop it inside a `relative` (ideally `overflow-hidden`)
// parent; it fills the parent behind the content.
export default function FilmGrain({ opacity = 0.035 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")',
        backgroundSize: '200px 200px',
      }}
    />
  )
}
