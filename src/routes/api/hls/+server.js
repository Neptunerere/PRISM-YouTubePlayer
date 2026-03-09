// src/routes/api/hls/+server.js
export async function GET({ url }) {
  const target = url.searchParams.get('url');
  if (!target) return new Response('url required', { status: 400 });

  const decoded = decodeURIComponent(target);

  try {
    const upstream = await fetch(decoded, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const isM3u8 = decoded.includes('.m3u8') || decoded.includes('index.m3u8') ||
      (upstream.headers.get('Content-Type') ?? '').includes('mpegurl');

    if (isM3u8) {
      const text = await upstream.text();

      // base URL: 마지막 / 이전까지
      const baseUrl = decoded.substring(0, decoded.lastIndexOf('/') + 1);

      const proxied = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;

        // 절대 URL이면 그대로, 상대 URL이면 base 붙이기
        const absUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
        return `/api/hls?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');

      return new Response(proxied, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        }
      });
    }

    // .ts 세그먼트 — 스트리밍으로 전달
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'video/MP2T',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      }
    });

  } catch (err) {
    console.error('[hls proxy]', err.message);
    return new Response('proxy error: ' + err.message, { status: 500 });
  }
}