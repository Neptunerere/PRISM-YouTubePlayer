// src/routes/api/stream/+server.js
import { spawn } from 'child_process';

import { YTDLP_PATH } from '$env/static/private';
const YTDLP = YTDLP_PATH || 'yt-dlp';

// 메모리 캐시 (같은 videoId면 yt-dlp 재실행 안 함)
const cache = new Map();

function getStreamUrls(videoId) {
  if (cache.has(videoId)) return Promise.resolve(cache.get(videoId));

  return new Promise((resolve, reject) => {
    // 먼저 라이브 여부 확인
    const infoProc = spawn(YTDLP, [
      '--print', 'is_live',
      '--no-download',
      `https://www.youtube.com/watch?v=${videoId}`
    ]);

    let isLiveOut = '';
    infoProc.stdout.on('data', d => isLiveOut += d.toString());

    const infoTimer = setTimeout(() => { infoProc.kill(); }, 15000);

    infoProc.on('close', () => {
      clearTimeout(infoTimer);
      const isLive = isLiveOut.trim() === 'True';

      // 라이브면 HLS 허용, 일반이면 mp4만
      const format = isLive
        ? 'best[protocol=m3u8]/best'
        : 'best[ext=mp4][protocol!=m3u8][protocol!=m3u8_native]/best[protocol!=m3u8][protocol!=m3u8_native]';

      const proc = spawn(YTDLP, [
        '-f', format,
        '--get-url',
        `https://www.youtube.com/watch?v=${videoId}`
      ]);

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());

      const timer = setTimeout(() => { proc.kill(); reject(new Error('timeout')); }, 60000);

      proc.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(stderr || 'yt-dlp 실패'));
        } else {
          const lines = stdout.trim().split('\n').filter(Boolean);
          const result = {
            videoUrl: lines[0],
            audioUrl: lines[1] ?? null,
            isLive
          };
          // 라이브는 1분, 일반은 5분 캐시
          cache.set(videoId, result);
          setTimeout(() => cache.delete(videoId), isLive ? 60 * 1000 : 5 * 60 * 1000);
          resolve(result);
        }
      });
    });
  });
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, request }) {
  const videoId = url.searchParams.get('id');
  const type = url.searchParams.get('type') ?? 'video';

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  const raw = url.searchParams.get('raw');

  try {
    const { videoUrl, audioUrl, isLive } = await getStreamUrls(videoId);

    // info 요청이면 URL 존재 여부만 JSON으로 반환 (캐시 워밍)
    if (type === 'info') {
      return new Response(JSON.stringify({ videoUrl: !!videoUrl, audioUrl: !!audioUrl, isLive: !!isLive }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // raw=1이면 실제 URL 반환 (라이브 HLS용)
    if (raw === '1') {
      return new Response(JSON.stringify({ rawUrl: videoUrl }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 분리 포맷(영상+오디오 URL이 따로)이면 audio 요청 처리
    const streamUrl = (type === 'audio' && audioUrl) ? audioUrl : videoUrl;
    if (!streamUrl) throw new Error('URL 없음');

    const rangeHeader = request.headers.get('range');
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (rangeHeader) headers['Range'] = rangeHeader;

    const upstream = await fetch(streamUrl, { headers });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'video/mp4',
        'Content-Length': upstream.headers.get('Content-Length') ?? '',
        'Content-Range': upstream.headers.get('Content-Range') ?? '',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      }
    });

  } catch (err) {
    console.error('[stream]', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}