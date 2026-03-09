<script>
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import {
    isPlaying, volume, currentTime, duration,
    playerReady, currentIndex, queue, isShuffle, isRepeat, setStatus
  } from '$lib/store.js';

  let videoEl;      // <video> 태그
  let audioEl;      // <audio> 태그 (영상/오디오 분리된 경우)
  let useSeparateAudio = false;
  let hlsInstance = null;
  let isLive = false;
  let liveVideoId = null; // 라이브일 때 iframe용 videoId

  export let quality = 'default';
  export let isPip = false;

  // ── 영상 로드 ────────────────────────────────────────────────
  export async function loadVideo(videoId) {
    if (!videoId) return;
    setStatus('영상 로딩 중...', true);
    playerReady.set(false);

    try {
      // 먼저 info로 분리 포맷 여부 + 라이브 여부 확인
      const infoRes = await fetch(`/api/stream?id=${videoId}&type=info`);
      const info = await infoRes.json();
      if (info.error) throw new Error(info.error);

      isLive = info.isLive ?? false;

      // 기존 hls 인스턴스 정리
      if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }

      if (isLive) {
        // 라이브는 YouTube iframe으로 전환
        liveVideoId = videoId;
        playerReady.set(true);
        isPlaying.set(true);
        setStatus('🔴 라이브 방송 중', true);
        return;
      } else {
        // 일반 영상
        useSeparateAudio = info.audioUrl;
        videoEl.src = `/api/stream?id=${videoId}&type=video`;

        if (useSeparateAudio && audioEl) {
          audioEl.src = `/api/stream?id=${videoId}&type=audio`;
          audioEl.volume = $volume / 100;
        } else if (audioEl) {
          audioEl.src = '';
        }
      }

      videoEl.load();
      // canplay 될 때까지 playerReady = false → 로딩 오버레이 보임
      await new Promise(res => videoEl.addEventListener('canplay', res, { once: true }));
      playerReady.set(true); // 여기서 비로소 true → 오버레이 사라지고 영상 페이드인
      videoEl.play().catch(() => {
        setStatus('▶ 재생 버튼을 눌러주세요');
      });

    } catch (e) {
      setStatus('로드 실패: ' + e.message);
      playerReady.set(false);
    }
  }

  // ── 컨트롤 ──────────────────────────────────────────────────
  export function stopVideo() {
    liveVideoId = null;
    if (!videoEl) return;
    videoEl.pause();
    videoEl.src = '';
    if (audioEl) audioEl.src = '';
    isPlaying.set(false);
    currentTime.set(0);
    duration.set(0);
    playerReady.set(false);
    setStatus('대기 중');
  }

  export function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      if (useSeparateAudio) audioEl?.play();
    } else {
      videoEl.pause();
      if (useSeparateAudio) audioEl?.pause();
    }
  }

  export function seekTo(ratio) {
    if (!videoEl) return;
    const t = (videoEl.duration || 0) * ratio;
    videoEl.currentTime = t;
    if (useSeparateAudio && audioEl) audioEl.currentTime = t;
  }

  export function setQuality(q) {
    quality = q;
    if ($queue[$currentIndex]) {
      // 현재 재생 위치 기억
      const savedTime = videoEl?.currentTime ?? 0;
      const wasPlaying = !videoEl?.paused;

      loadVideo($queue[$currentIndex].videoId).then(() => {
        // 로드 완료 후 이전 위치로 복원
        if (videoEl && savedTime > 0) {
          videoEl.currentTime = savedTime;
        }
        if (wasPlaying) videoEl?.play();
      });
    }
  }

  // PIP — 진짜 <video> 태그라 완벽하게 동작!
  export async function togglePip() {
    console.log('[PIP] called, videoEl:', videoEl, 'src:', videoEl?.src?.slice(0,50));
    if (!videoEl) return;
    if (!document.pictureInPictureEnabled) {
      setStatus('이 브라우저는 PIP를 지원하지 않습니다');
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        isPip = false;
        setStatus('PIP 종료');
      } else {
        await videoEl.requestPictureInPicture();
        isPip = true;
        setStatus('PIP 모드 켜짐', true);
        videoEl.addEventListener('leavepictureinpicture', () => {
          isPip = false;
          setStatus('PIP 종료');
        }, { once: true });
      }
    } catch (e) {
      setStatus('PIP 오류: ' + e.message);
    }
  }

  // ── 볼륨 동기화 ──────────────────────────────────────────────
  $: if (videoEl && !useSeparateAudio) videoEl.volume = $volume / 100;
  $: if (audioEl && useSeparateAudio)  audioEl.volume  = $volume / 100;

  // ── 비디오 이벤트 ────────────────────────────────────────────
  function onPlay() {
    isPlaying.set(true);
    setStatus('재생 중', true);
    if (useSeparateAudio && audioEl) {
      audioEl.currentTime = videoEl.currentTime;
      audioEl.play().catch(() => {});
    }
  }
  function onPause() {
    isPlaying.set(false);
    setStatus('일시정지');
    if (useSeparateAudio && audioEl) audioEl.pause();
  }
  function onEnded() {
    isPlaying.set(false);

    const $q      = get(queue);
    const $ci     = get(currentIndex);
    const $repeat = get(isRepeat);
    const $shuf   = get(isShuffle);

    if ($q.length === 0) return;

    // 2 = 한 곡 반복
    if ($repeat === 2) {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {});
      if (useSeparateAudio && audioEl) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {});
      }
      return;
    }

    let next = $ci + 1;
    if ($shuf) next = Math.floor(Math.random() * $q.length);

    // 1 = 전체 반복 — 마지막이면 처음으로
    if (next >= $q.length) {
      if ($repeat === 1) next = 0;
      else return; // 0 = off, 끝
    }

    currentIndex.set(next);
  }
  function onTimeUpdate() { currentTime.set(videoEl.currentTime); }
  function onDurationChange() { duration.set(videoEl.duration || 0); }
  function onWaiting()  { setStatus('버퍼링...'); }
  function onCanPlay()  { setStatus('재생 중', true); }

  // ── currentIndex 변경 시 영상 로드 ──────────────────────────
  let prevIndex = -1;
  $: if ($currentIndex !== prevIndex && $currentIndex >= 0 && $queue[$currentIndex]) {
    prevIndex = $currentIndex;
    loadVideo($queue[$currentIndex].videoId);
  }

  onMount(() => {
    playerReady.set(true);
    // 앱 시작 시 이미 큐에 곡이 있으면 (localStorage 복원 시)
    if ($currentIndex >= 0 && $queue[$currentIndex]) {
      setTimeout(() => loadVideo($queue[$currentIndex].videoId), 100);
    }
  });

  onDestroy(() => {
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    if (videoEl) videoEl.src = '';
    if (audioEl) audioEl.src = '';
  });
</script>

<div class="player-frame">
  <!-- 라이브일 때 YouTube iframe -->
  {#if liveVideoId}
    <iframe
      src="https://www.youtube.com/embed/{liveVideoId}?autoplay=1&rel=0"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen
      style="position:absolute;inset:0;width:100%;height:100%;border:none;"
    ></iframe>
  {/if}

  <!-- 메인 비디오 태그 — PIP 완벽 지원 -->
  <video
    bind:this={videoEl}
    on:play={onPlay}
    on:pause={onPause}
    on:ended={onEnded}
    on:timeupdate={onTimeUpdate}
    on:durationchange={onDurationChange}
    on:waiting={onWaiting}
    on:canplay={onCanPlay}
    playsinline
    style="opacity: {$playerReady && $queue[$currentIndex] && !liveVideoId ? 1 : 0}; transition: opacity 0.3s;"
  ></video>

  <!-- 오디오 분리 포맷용 숨김 audio 태그 -->
  <audio bind:this={audioEl} style="display:none"></audio>

  {#if !$queue[$currentIndex]}
    <!-- 아무것도 선택 안 된 초기 화면 -->
    <div class="overlay idle">
      <img
        src="/main-banner.jpg"
        alt="background"
        class="bg-img"
      />
      <div class="idle-content">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1" opacity="0.6">
          <circle cx="12" cy="12" r="10"/>
          <polygon points="10 8 16 12 10 16 10 8" fill="white"/>
        </svg>
        <p class="idle-text">검색 후 영상을 선택하세요</p>
      </div>
    </div>
  {:else if !$playerReady}
    <!-- 로딩 중 화면 — 썸네일 블러 배경 -->
    <div class="overlay loading">
      {#if $queue[$currentIndex]?.thumbnail}
        <img
          src={$queue[$currentIndex].thumbnail}
          alt="thumbnail"
          class="bg-img blur"
        />
      {/if}
      <div class="loading-content">
        <img
          src={$queue[$currentIndex]?.thumbnail}
          alt="album art"
          class="album-art"
        />
        <div class="loading-info">
          <div class="loading-title">{$queue[$currentIndex]?.title ?? ''}</div>
          <div class="loading-channel">{$queue[$currentIndex]?.channel ?? ''}</div>
        </div>
        <div class="spinner"></div>
        <p class="loading-text">영상 로딩 중...</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .player-frame {
    position: relative;
    width: 100%;
    padding-top: 56.25%;
    background: #0d1117;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  /* 배경 이미지 */
  .bg-img {
    position: absolute;
    inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .bg-img.blur {
    filter: blur(24px) brightness(0.35) saturate(1.4);
    transform: scale(1.1);
  }

  /* 초기 화면 */
  .idle-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(0,0,0,0.5);
  }
  .idle-text {
    font-family: 'OngleipParkDahyeon', 'DM Sans', sans-serif;
    font-size: 18px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.4);
  }

  /* 로딩 화면 */
  .loading-content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .album-art {
    width: 100px; height: 100px;
    object-fit: cover;
    border-radius: 2px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    animation: float 3s ease-in-out infinite;
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50%       { transform: translateY(-6px); }
  }
  .loading-info {
    text-align: center;
    padding: 0 24px;
  }
  .loading-title {
    font-size: 18px;
    font-weight: 500;
    color: rgba(255,255,255,0.9);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
  }
  .loading-channel {
    font-family: 'DM Mono', monospace;
    font-size: 18px;
    color: rgba(255,255,255,0.4);
    letter-spacing: 1px;
  }
  .loading-text {
    font-family: 'DM Mono', monospace;
    font-size: 18px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: rgba(79,195,247,0.8);
  }
  .spinner {
    width: 24px; height: 24px;
    border: 2px solid rgba(255,255,255,0.08);
    border-top-color: #4fc3f7;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>