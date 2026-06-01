// Real stock wedding photos served from /gallery/.
// Each is assigned a Reverie mode — the gallery processes them through
// the full filter pipeline so visitors see the actual product aesthetic.
//
// Mode distribution: 4 Disposable, 3 Polaroid, 4 Super 8
// Order tuned for visual rhythm in the 2-column masonry grid.

import type { CameraModeName } from '@/types/session'

export interface SeedPhoto {
  id: string
  src: string
  mode: CameraModeName
  label: string
}

export const SEED_PHOTOS: SeedPhoto[] = [
  { id: 's1',  src: '/gallery/pexels-breno-cardoso-149064345-18322549.jpg',   mode: 'disposable', label: 'The kiss' },
  { id: 's2',  src: '/gallery/pexels-jonathanborba-12876507.jpg',             mode: 'polaroid',   label: 'Reception table' },
  { id: 's3',  src: '/gallery/pexels-jonathan-nenemann-13434437.jpg',         mode: 'super8',     label: 'The toast' },
  { id: 's4',  src: '/gallery/pexels-rebornfilmes-32805167.jpg',              mode: 'polaroid',   label: 'Candid' },
  { id: 's5',  src: '/gallery/pexels-sam-gibson-2151569207-31757195.jpg',     mode: 'super8',     label: 'Confetti exit' },
  { id: 's6',  src: '/gallery/photo-1773946032660-0da0c6eb3c9c.avif',         mode: 'disposable', label: 'Together' },
  { id: 's7',  src: '/gallery/pexels-optical-service-839760784-26965603.jpg', mode: 'disposable', label: 'Church exit' },
  { id: 's8',  src: '/gallery/photo-1614566975254-ac5d72b15afc.avif',         mode: 'super8',     label: 'Reception' },
  { id: 's9',  src: '/gallery/pexels-pavel-danilyuk-8815267.jpg',             mode: 'disposable', label: 'The ceremony' },
  { id: 's10', src: '/gallery/photo-1751615072331-7d6e8faa934d.avif',         mode: 'super8',     label: 'Golden hour' },
  { id: 's11', src: '/gallery/photo-1777918176100-54bded4c8ca6.avif',         mode: 'polaroid',   label: 'Details' },
]
