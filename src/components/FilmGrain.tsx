import { useEffect, useRef } from 'react'

interface Props {
  opacity?: number
}

// Generates real randomized grain at 12fps — film grain doesn't animate at 60fps.
// Canvas is 256x256 and CSS-tiled; cheap enough to run indefinitely.
export default function FilmGrain({ opacity = 0.038 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 256
    canvas.height = 256

    let animId: number
    let lastTime = 0
    const FPS = 12

    function tick(time: number) {
      if (time - lastTime >= 1000 / FPS) {
        const imageData = ctx!.createImageData(256, 256)
        const d = imageData.data
        for (let i = 0; i < d.length; i += 4) {
          // Bias toward midgray so overlay blend is balanced
          const v = 100 + Math.random() * 110
          d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255
        }
        ctx!.putImageData(imageData, 0, 0)
        lastTime = time
      }
      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        opacity,
        mixBlendMode: 'soft-light',
        // Tile the 256x256 canvas across the full screen
        imageRendering: 'auto',
        objectFit: 'fill',
      }}
    />
  )
}
