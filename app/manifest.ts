import type { MetadataRoute } from 'next';

// Makes AssistAnt installable as an app on desktop (Chrome/Edge) and on your phone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AssistAnt',
    short_name: 'AssistAnt',
    description: 'A personal agent that wraps up your day in Notion and plans tomorrow.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#FFFFFF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
