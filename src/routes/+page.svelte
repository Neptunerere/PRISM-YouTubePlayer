<script>
  // src/routes/+page.svelte
  import { tick } from 'svelte';
  import YoutubePlayer from '$lib/components/YoutubePlayer.svelte';
  import PlaylistPanel from '$lib/components/PlaylistPanel.svelte';
  import { playlists } from '$lib/playlist.js';
  import {
    queue, currentIndex, currentTrack, isPlaying,
    isShuffle, isRepeat, volume, progress,
    currentTime, duration, playerReady, status, setStatus
  } from '$lib/store.js';

  let playerComponent;
  let searchQuery = '';
  let searchResults = [];
  let isSearching = false;
  let searchError = '';

  let currentQuality = 'default';
  let showSaveModal = false;
  let saveTarget = null; // 저장할 트랙
  let isPip = false;
  const qualities = [
    { value: 'hd1080',  label: '1080p' },
    { value: 'hd720',   label: '720p' },
    { value: 'large',   label: '480p' },
    { value: 'medium',  label: '360p' },
    { value: 'small',   label: '240p' },
    { value: 'default', label: 'AUTO' },
  ];

  function saveToPlaylist(item) {
    saveTarget = item;
    showSaveModal = true;
  }

  function confirmSave(categoryId) {
    if (saveTarget) playlists.addTrack(categoryId, saveTarget);
    showSaveModal = false;
    saveTarget = null;
  }

  function changeQuality(q) {
    currentQuality = q;
    playerComponent?.setQuality(q);
  }

  // ── Search ──────────────────────────────────────────────────
  async function search() {
    const q = searchQuery.trim();
    if (!q) return;
    isSearching = true;
    searchError = '';
    searchResults = [];

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      searchResults = data.items;
      setStatus(`"${q}" 검색 완료 — ${data.items.length}개`);
    } catch (e) {
      searchError = e.message;
      setStatus('검색 실패');
    } finally {
      isSearching = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') search();
  }

  // ── Queue & Play ────────────────────────────────────────────
  function playNow(item) {
    // Add to queue if not present
    queue.update($q => {
      if (!$q.find(t => t.videoId === item.videoId)) {
        return [...$q, item];
      }
      return $q;
    });
    // Find index and play
    queue.subscribe($q => {
      const idx = $q.findIndex(t => t.videoId === item.videoId);
      currentIndex.set(idx);
    })();
  }

  function addToQueue(item) {
    queue.update($q => {
      if ($q.find(t => t.videoId === item.videoId)) return $q;
      return [...$q, item];
    });
    setStatus(`"${item.title.slice(0, 20)}..." 큐에 추가됨`);
  }

  function removeFromQueue(idx) {
    queue.update($q => $q.filter((_, i) => i !== idx));
    currentIndex.update($ci => {
      if ($ci >= idx) return Math.max(0, $ci - 1);
      return $ci;
    });
  }

  function playFromQueue(idx) {
    currentIndex.set(idx);
  }

  // ── Controls ────────────────────────────────────────────────
  function togglePlay() {
    playerComponent?.togglePlay();
  }

  function prevTrack() {
    currentIndex.update($ci => Math.max(0, $ci - 1));
  }

  function nextTrack() {
    queue.subscribe($q => {
      currentIndex.update($ci => {
        if ($q.length === 0) return $ci;
        let next = $ci + 1;
        if ($isShuffle) next = Math.floor(Math.random() * $q.length);
        return next < $q.length ? next : $ci;
      });
    })();
  }

  function seekTo(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    playerComponent?.seekTo(ratio);
  }

  function formatTime(s) {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
</script>

<svelte:head>
  <title>PRISM — YouTube Player</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
</svelte:head>

<main>
  <!-- 저장 모달 -->
  {#if showSaveModal}
    <div class="modal-backdrop" on:click={() => showSaveModal = false}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <span>플레이리스트에 저장</span>
          <button on:click={() => showSaveModal = false}>✕</button>
        </div>
        <div class="modal-track">
          <img src={saveTarget?.thumbnail} alt="" />
          <div>
            <div class="modal-title">{saveTarget?.title}</div>
            <div class="modal-ch">{saveTarget?.channel}</div>
          </div>
        </div>
        {#if $playlists.length === 0}
          <div class="modal-empty">카테고리가 없습니다.<br/>플레이리스트 패널에서 먼저 추가하세요.</div>
        {:else}
          {#each $playlists as cat}
            <button class="cat-select-btn" on:click={() => confirmSave(cat.id)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              {cat.name}
              <span>{cat.tracks.length}곡</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
  <!-- Header -->
  <header>
    <h1>PRISM</h1>
    <span class="tagline">YouTube Player</span>
  </header>

  <div class="app-layout">
  <div class="left-col">
  <!-- Search -->
  <div class="search-bar">
    <input
      type="text"
      bind:value={searchQuery}
      on:keydown={handleKeydown}
      placeholder="제목, 아티스트, 곡명..."
    />
    <button on:click={search} disabled={isSearching}>
      {isSearching ? '...' : '검색'}
    </button>
  </div>

  <!-- Player + Controls -->
  <section class="player-section">
    <YoutubePlayer bind:this={playerComponent} />

    <!-- Now Playing -->
    <div class="now-playing">
      {#if $currentTrack}
        <div class="track-title">{$currentTrack.title}</div>
        <div class="track-meta">{$currentTrack.channel}</div>
      {:else}
        <div class="track-title empty-title">—</div>
        <div class="track-meta">재생 중인 영상이 없습니다</div>
      {/if}
    </div>

    <!-- Progress -->
    <div class="progress-area">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="progress-track" on:click={seekTo}>
        <div class="progress-fill" style="width:{$progress}%"></div>
      </div>
      <div class="time-labels">
        <span>{formatTime($currentTime)}</span>
        <span>{formatTime($duration)}</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls">
      <button class="ctrl-btn" on:click={prevTrack} aria-label="이전">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>

      <button class="ctrl-btn play-pause" on:click={togglePlay} aria-label="재생/일시정지">
        {#if $isPlaying}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        {:else}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        {/if}
      </button>

      <button class="ctrl-btn" on:click={nextTrack} aria-label="다음">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>

      <button class="ctrl-btn" class:active={$isShuffle} on:click={() => isShuffle.update(v => !v)} aria-label="셔플">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>
      </button>

      <button
        class="ctrl-btn repeat-btn"
        class:active={$isRepeat > 0}
        on:click={() => isRepeat.update(v => (v + 1) % 3)}
        aria-label="반복"
        title={$isRepeat === 0 ? '반복 없음' : $isRepeat === 1 ? '전체 반복' : '한 곡 반복'}
      >
        {#if $isRepeat === 2}
          <!-- 한 곡 반복: 1 뱃지 표시 -->
          <span class="repeat-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            <span class="repeat-one">1</span>
          </span>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        {/if}
      </button>

      <button class="ctrl-btn" class:active={isPip} on:click={() => {
        const video = document.querySelector('video');
        if (!video) return;
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().then(() => { isPip = false; });
        } else {
          video.requestPictureInPicture().then(() => {
            isPip = true;
            video.addEventListener('leavepictureinpicture', () => { isPip = false; }, { once: true });
          }).catch(e => console.error('PIP:', e));
        }
      }} aria-label="PIP">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>
      </button>

      <div class="volume-area">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="vol-icon">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
        <input type="range" class="volume-slider" min="0" max="100" bind:value={$volume} />
      </div>
    </div>

    <!-- 화질 선택 -->
    <div class="quality-bar">
      <span class="quality-label">화질</span>
      {#each qualities as q}
        <button
          class="quality-btn"
          class:active={currentQuality === q.value}
          on:click={() => changeQuality(q.value)}
        >{q.label}</button>
      {/each}
    </div>

    <!-- Status -->
    <div class="status-bar">
      <div class="status-dot" class:active={$status.active}></div>
      <span>{$status.text}</span>
    </div>
  </section>

  <!-- Two-column layout for results + queue -->
  <div class="bottom-grid">
    <!-- Search Results -->
    <section class="panel">
      <div class="panel-header">
        <span>검색 결과</span>
        {#if searchResults.length > 0}
          <span class="count">{searchResults.length}개</span>
        {/if}
      </div>

      {#if isSearching}
        <div class="empty"><div class="spinner"></div></div>
      {:else if searchError}
        <div class="empty error">{searchError}</div>
      {:else if searchResults.length === 0}
        <div class="empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>검색 결과가 없습니다</p>
        </div>
      {:else}
        {#each searchResults as item (item.videoId)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="track-item"
            class:playing={$currentTrack?.videoId === item.videoId}
            on:click={() => playNow(item)}
          >
            <div class="thumb">
              <img src={item.thumbnail} alt="" loading="lazy" />
              <div class="play-over">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
            <div class="track-info">
              <div class="t-title">{item.title}</div>
              <div class="t-meta">{item.channel}{item.duration ? ' · ' + item.duration : ''}</div>
            </div>
            <button class="q-btn save" on:click|stopPropagation={() => saveToPlaylist(item)} title="플레이리스트에 저장">♥</button>
        <button class="q-btn" on:click|stopPropagation={() => addToQueue(item)}>+</button>
          </div>
        {/each}
      {/if}
    </section>

    <!-- Queue -->
    <section class="panel">
      <div class="panel-header">
        <span>재생 목록</span>
        <div style="display:flex;align-items:center;gap:8px">
          {#if $queue.length > 0}
            <span class="count">{$queue.length}개 · 저장됨 ✓</span>
            <button class="clear-btn" on:click={() => { queue.set([]); currentIndex.set(-1); playerComponent?.stopVideo?.(); }}>전체삭제</button>
          {/if}
        </div>
      </div>

      {#if $queue.length === 0}
        <div class="empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          <p>목록이 비어있습니다</p>
        </div>
      {:else}
        {#each $queue as item, i (item.videoId)}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div
            class="track-item"
            class:playing={$currentIndex === i}
            on:click={() => playFromQueue(i)}
          >
            <div class="q-num">{$currentIndex === i ? '▶' : i + 1}</div>
            <div class="track-info">
              <div class="t-title">{item.title}</div>
              <div class="t-meta">{item.channel}{item.duration ? ' · ' + item.duration : ''}</div>
            </div>
            <button class="q-btn remove" on:click|stopPropagation={() => removeFromQueue(i)}>✕</button>
          </div>
        {/each}
      {/if}
    </section>
  </div>
  </div><!-- left-col -->

  <!-- 우측 플레이리스트 패널 -->
  <div class="right-col">
    <PlaylistPanel />
  </div>
  </div><!-- app-layout -->
</main>

<style>
  @font-face {
    font-family: 'OngleipParkDahyeon';
    src: url('https://cdn.jsdelivr.net/gh/projectnoonnu/2411-3@1.0/Ownglyph_ParkDaHyun.woff2') format('woff2');
    font-weight: normal;
    font-display: swap;
  }

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }

  /* App layout */
  :global(body) { overflow: hidden; }
  .app-layout {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 0;
    align-items: stretch;
    height: calc(100vh - 88px);
  }
  .left-col {
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .left-col::-webkit-scrollbar { width: 4px; }
  .left-col::-webkit-scrollbar-thumb { background: var(--border); }
  .right-col {
    height: 100%;
    border-left: 1px solid var(--border);
    overflow: hidden;
  }
  @media (max-width: 900px) {
    :global(body) { overflow: auto; }
    .app-layout { grid-template-columns: 1fr; height: auto; }
    .right-col { height: 400px; border-left: none; border-top: 1px solid var(--border); }
  }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  }
  .modal {
    background: #111; border: 1px solid #333;
    width: 320px; max-width: 90vw; overflow: hidden;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 16px; border-bottom: 1px solid #242424;
    font-family: 'OngleipParkDahyeon', sans-serif; font-size: 18px;
    letter-spacing: 2px; text-transform: uppercase; color: #555;
  }
  .modal-header button {
    background: none; border: none; color: #555; cursor: pointer; font-size: 18px;
    transition: color 0.15s;
  }
  .modal-header button:hover { color: #ff4757; }
  .modal-track {
    display: flex; gap: 10px; padding: 12px 16px;
    border-bottom: 1px solid #242424; align-items: center;
  }
  .modal-track img { width: 56px; height: 32px; object-fit: cover; flex-shrink: 0; }
  .modal-title { font-size: 18px; margin-bottom: 3px; }
  .modal-ch { font-family: 'OngleipParkDahyeon', sans-serif; font-size: 18px; color: #555; }
  .modal-empty {
    padding: 24px 16px; text-align: center;
    font-family: 'OngleipParkDahyeon', sans-serif; font-size: 18px; color: #555; line-height: 1.8;
  }
  .cat-select-btn {
    display: flex; align-items: center; gap: 8px; width: 100%;
    background: none; border: none; border-bottom: 1px solid #1a1a1a;
    color: #f0f0f0; cursor: pointer; padding: 12px 16px;
    font-family: 'OngleipParkDahyeon', 'DM Sans', sans-serif; font-size: 18px;
    transition: background 0.15s; text-align: left;
  }
  .cat-select-btn:hover { background: #1a1a1a; }
  .cat-select-btn span {
    margin-left: auto; font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px; color: #555;
  }
  .q-btn.save { color: #555; }
  .q-btn.save:hover { border-color: #ff4757; color: #ff4757; }
  :global(body) {
    background: #090d13;
    color: #e6edf3;
    font-family: 'OngleipParkDahyeon', 'DM Sans', sans-serif;
    min-height: 100vh;
  }

  :root {
    --accent: #4fc3f7;
    --accent-dark: #0288d1;
    --accent-glow: rgba(79, 195, 247, 0.3);
    --surface: #0d1117;
    --surface2: #161b22;
    --border: #21262d;
    --muted: #4d5566;
    --muted2: #1c2128;
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px 80px;
  }

  /* Header */
  header {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 36px;
  }
  h1 {
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    letter-spacing: 4px;
    color: var(--accent);
    line-height: 1;
    text-shadow: 0 0 24px var(--accent-glow);
  }
  .tagline {
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* Search */
  .search-bar {
    display: flex;
    margin-bottom: 24px;
    border: 1px solid var(--border);
    background: var(--surface);
    transition: border-color 0.2s;
  }
  .search-bar:focus-within { border-color: var(--accent); }
  .search-bar input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    padding: 14px 18px;
    color: #f0f0f0;
    font-family: 'OngleipParkDahyeon', 'DM Sans', sans-serif;
    font-size: 18px;
  }
  .search-bar input::placeholder { color: var(--muted); }
  .search-bar button {
    background: var(--accent);
    border: none;
    cursor: pointer;
    padding: 0 24px;
    color: #000;
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    letter-spacing: 2px;
    font-weight: 500;
    transition: background 0.15s;
  }
  .search-bar button:hover:not(:disabled) { background: var(--accent-dark); color: #fff; }
  .search-bar button:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Player Section */
  .player-section {
    background: var(--surface);
    border: 1px solid var(--border);
    margin-bottom: 2px;
  }

  /* Now playing */
  .now-playing {
    padding: 18px 24px 14px;
    border-bottom: 1px solid var(--border);
    min-height: 64px;
  }
  .track-title {
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty-title { color: var(--muted); }
  .track-meta {
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 1px;
  }

  /* Progress */
  .progress-area {
    padding: 14px 24px 8px;
    border-bottom: 1px solid var(--border);
  }
  .progress-track {
    width: 100%;
    height: 3px;
    background: var(--muted2);
    cursor: pointer;
    position: relative;
    margin-bottom: 8px;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
    transition: width 0.3s linear;
    position: relative;
  }
  .progress-fill::after {
    content: '';
    position: absolute;
    right: -5px; top: 50%;
    transform: translateY(-50%);
    width: 10px; height: 10px;
    background: var(--accent);
    border-radius: 50%;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .progress-track:hover .progress-fill::after { opacity: 1; }
  .time-labels {
    display: flex;
    justify-content: space-between;
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 1px;
  }

  /* Controls */
  .controls {
    display: flex;
    align-items: center;
    padding: 10px 24px;
    gap: 2px;
  }
  .ctrl-btn {
    background: none;
    border: none;
    color: #f0f0f0;
    cursor: pointer;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, transform 0.1s;
    opacity: 0.65;
  }
  .ctrl-btn:hover { opacity: 1; color: var(--accent); }
  .ctrl-btn:active { transform: scale(0.88); }
  .ctrl-btn.active { color: var(--accent); opacity: 1; }
  .ctrl-btn.play-pause {
    width: 44px; height: 44px;
    background: var(--accent);
    color: #fff;
    opacity: 1;
    margin: 0 6px;
    transition: background 0.15s, transform 0.1s;
  }
  .ctrl-btn.play-pause:hover { background: var(--accent-dark); }

  .repeat-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .repeat-one {
    position: absolute;
    top: -6px;
    right: -7px;
    background: var(--accent);
    color: #fff;
    font-size: 18px;
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-weight: 700;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .volume-area {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  .vol-icon { color: var(--muted); }
  .volume-slider {
    -webkit-appearance: none;
    width: 80px; height: 3px;
    background: var(--muted2);
    outline: none;
    cursor: pointer;
  }
  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px; height: 12px;
    background: var(--accent);
    border-radius: 50%;
    cursor: pointer;
  }

  /* Quality bar */
  .quality-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 24px;
    border-top: 1px solid var(--border);
    background: var(--surface2);
  }
  .quality-label {
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-right: 8px;
  }
  .quality-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    padding: 3px 10px;
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    letter-spacing: 1px;
    transition: all 0.15s;
  }
  .quality-btn:hover { border-color: var(--accent); color: var(--accent); }
  .quality-btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  /* Status */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 24px;
    background: var(--surface2);
    border-top: 1px solid var(--border);
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 1px;
  }
  .status-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--muted);
    flex-shrink: 0;
    transition: background 0.3s;
  }
  .status-dot.active {
    background: var(--accent);
    box-shadow: 0 0 6px var(--accent);
    animation: pulse 1.5s infinite;
  }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }

  /* Bottom Grid */
  .bottom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    margin-top: 2px;
  }
  @media (max-width: 640px) {
    .bottom-grid { grid-template-columns: 1fr; }
  }

  /* Panels */
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    min-height: 200px;
    max-height: 480px;
    overflow-y: auto;
  }
  .panel::-webkit-scrollbar { width: 4px; }
  .panel::-webkit-scrollbar-track { background: transparent; }
  .panel::-webkit-scrollbar-thumb { background: var(--border); }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--muted);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }
  .count { color: var(--accent); }

  /* Track items */
  .track-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s;
    position: relative;
  }
  .track-item:last-child { border-bottom: none; }
  .track-item:hover { background: var(--surface2); }
  .track-item.playing { background: var(--surface2); }
  .track-item.playing::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: var(--accent);
  }

  .thumb {
    width: 64px; height: 36px;
    flex-shrink: 0;
    background: var(--muted2);
    position: relative;
    overflow: hidden;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .play-over {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .track-item:hover .play-over { opacity: 1; }
  .track-item.playing .play-over { opacity: 1; background: rgba(232,255,71,0.15); }

  .q-num {
    width: 24px;
    text-align: center;
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .track-item.playing .q-num { color: var(--accent); }

  .track-info { flex: 1; min-width: 0; }
  .t-title {
    font-size: 18px;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }
  .t-meta {
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 0.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .q-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    width: 24px; height: 24px;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;
    line-height: 1;
  }
  .q-btn:hover { border-color: var(--accent); color: var(--accent); }
  .q-btn.remove:hover { border-color: #ff4757; color: #ff4757; }

  /* Empty states */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    gap: 12px;
  }
  .empty p {
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    color: var(--muted);
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .empty.error { color: #ff4757; }
  .empty.error p { color: #ff4757; letter-spacing: 0; font-size: 18px; text-transform: none; }

  .clear-btn {
    background: none;
    border: 1px solid #333;
    color: #555;
    cursor: pointer;
    padding: 2px 8px;
    font-family: 'OngleipParkDahyeon', sans-serif;
    font-size: 18px;
    letter-spacing: 1px;
    transition: all 0.15s;
  }
  .clear-btn:hover { border-color: #ff4757; color: #ff4757; }

  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--muted2);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>