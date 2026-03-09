// src/routes/api/search/+server.js
import { Innertube } from 'youtubei.js';

// 서버 인스턴스 재사용 (매 요청마다 생성 X)
let yt = null;
async function getInnertube() {
  if (!yt) yt = await Innertube.create({ gl: 'KR', hl: 'ko' });
  return yt;
}

// continuation 토큰 임시 저장 (Map: token → SearchContinuation 객체)
const continuationCache = new Map();

export async function GET({ url }) {
  const query       = url.searchParams.get('q');
  const contToken   = url.searchParams.get('continuation');

  if (!query && !contToken) {
    return json({ error: 'query required' }, 400);
  }

  try {
    const innertube = await getInnertube();
    let items = [];
    let nextToken = null;

    if (contToken && continuationCache.has(contToken)) {
      // 이전 검색 결과 객체에서 다음 페이지 가져오기
      const prevResult = continuationCache.get(contToken);
      continuationCache.delete(contToken);

      const next = await prevResult.getContinuation();
      items = parseVideos(next);

      // 다음 continuation 저장
      if (next.has_continuation) {
        const newToken = crypto.randomUUID();
        continuationCache.set(newToken, next);
        nextToken = newToken;
        // 10분 후 자동 만료
        setTimeout(() => continuationCache.delete(newToken), 10 * 60 * 1000);
      }
    } else {
      // 새 검색
      const results = await innertube.search(query, { type: 'video' });
      items = parseVideos(results);

      if (results.has_continuation) {
        const token = crypto.randomUUID();
        continuationCache.set(token, results);
        nextToken = token;
        setTimeout(() => continuationCache.delete(token), 10 * 60 * 1000);
      }
    }

    return new Response(JSON.stringify({ items, nextContinuation: nextToken }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[search]', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

function parseVideos(results) {
  const videos = results.videos ?? results.results ?? [];
  return videos
    .filter(v => v.type === 'Video' || v.id)
    .map(v => ({
      videoId:   v.id,
      title:     v.title?.toString() ?? '',
      channel:   v.author?.name ?? v.channel?.name ?? '',
      duration:  v.duration?.text ?? '',
      views:     v.view_count?.text ?? v.short_view_count?.text ?? '',
      thumbnail: v.thumbnails?.at(-1)?.url ?? v.best_thumbnail?.url ?? '',
      isLive:    v.is_live ?? false,
    }))
    .filter(v => v.videoId && v.title);
}