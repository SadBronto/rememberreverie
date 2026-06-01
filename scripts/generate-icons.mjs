import sharp from 'sharp'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'

// Reverie brand colors
const INK = '#1a1612'
const CREAM = '#f5f0e8'

// SVG icon: ink background with elegant "R" in serif — simple, recognizable at all sizes
function makeIconSvg(size) {
  const fontSize = Math.round(size * 0.58)
  const textY = Math.round(size * 0.73)
  const radius = Math.round(size * 0.22)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}" rx="${radius}"/>
  <text
    x="${size / 2}"
    y="${textY}"
    text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="${fontSize}"
    font-weight="400"
    fill="${CREAM}"
    letter-spacing="-2"
  >R</text>
</svg>`
}

if (!existsSync('public')) await mkdir('public')

const sizes = [
  { file: 'public/pwa-512x512.png', size: 512 },
  { file: 'public/pwa-192x192.png', size: 192 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/favicon.ico',  size: 32 },
]

for (const { file, size } of sizes) {
  const svg = Buffer.from(makeIconSvg(size))
  const ext = file.endsWith('.ico') ? 'png' : 'png'
  await sharp(svg, { density: 300 })
    .resize(size, size)
    [ext]()
    .toFile(file)
  console.log(`✓ ${file}`)
}

console.log('Icons generated.')
