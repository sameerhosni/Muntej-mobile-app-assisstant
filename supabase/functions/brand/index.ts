// brand — the Muntej logo as public PNGs for emails (mail apps need an https image; the app bundles its own copies).
//   GET /functions/v1/brand?f=wordmark-white | wordmark | symbol   (public, no sign-in; cached for a week)
import { IMAGES } from './images.ts';

const bytes = new Map(
  Object.entries(IMAGES).map(([k, b64]) => [k, Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]),
);

Deno.serve((req) => {
  const f = new URL(req.url).searchParams.get('f') ?? 'wordmark';
  const img = bytes.get(f);
  if (req.method !== 'GET' || !img) return new Response('Not found', { status: 404 });
  return new Response(img, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
