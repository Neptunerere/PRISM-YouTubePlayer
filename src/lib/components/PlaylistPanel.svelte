<script>
  // src/lib/components/PlaylistPanel.svelte
  import { playlists } from '$lib/playlist.js';
  import { queue, currentIndex } from '$lib/store.js';

  export let onPlayTrack = () => {};

  let view = 'categories'; // 'categories' | 'tracks'
  let dragIndex = null;
  let dragOverIndex = null;

  function onDragStart(e, i) {
    dragIndex = i;
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndex = i;
  }

  function onDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
  }

  function onDrop(e, i) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;

    playlists.reorderTracks(selectedCategory.id, dragIndex, i);
    dragIndex = null;
    dragOverIndex = null;
  }
  let selectedCategory = null;
  let newCategoryName = '';
  let isAddingCategory = false;
  let renamingId = null;
  let renameValue = '';

  // 카테고리 선택 → 트랙 목록으로
  function openCategory(cat) {
    selectedCategory = cat;
    view = 'tracks';
  }

  function backToCategories() {
    view = 'categories';
    selectedCategory = null;
  }

  // 카테고리 추가
  function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    playlists.addCategory(name);
    newCategoryName = '';
    isAddingCategory = false;
  }

  // 트랙 큐에 추가 후 재생
  function playTrack(track) {
    queue.update($q => {
      if (!$q.find(t => t.videoId === track.videoId)) return [...$q, track];
      return $q;
    });
    queue.subscribe($q => {
      const idx = $q.findIndex(t => t.videoId === track.videoId);
      currentIndex.set(idx);
    })();
  }

  // 카테고리 전체 큐에 추가
  function playAll(cat) {
    queue.update($q => {
      const newTracks = cat.tracks.filter(t => !$q.find(q => q.videoId === t.videoId));
      return [...$q, ...newTracks];
    });
    queue.subscribe($q => {
      const idx = $q.findIndex(t => t.videoId === cat.tracks[0]?.videoId);
      if (idx >= 0) currentIndex.set(idx);
    })();
  }

  // 선택된 카테고리 실시간 반영
  $: if (selectedCategory) {
    const updated = $playlists.find(p => p.id === selectedCategory.id);
    if (updated) selectedCategory = updated;
  }
</script>

<div class="panel">
  <!-- 헤더 -->
  <div class="panel-header">
    {#if view === 'tracks'}
      <button class="back-btn" on:click={backToCategories}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="header-title">{selectedCategory?.name}</span>
      <span class="count">{selectedCategory?.tracks.length ?? 0}곡</span>
    {:else}
      <span class="header-title">플레이리스트</span>
      <button class="add-cat-btn" on:click={() => isAddingCategory = !isAddingCategory}>+</button>
    {/if}
  </div>

  <!-- 카테고리 추가 입력 -->
  {#if isAddingCategory && view === 'categories'}
    <div class="add-input-row">
      <input
        type="text"
        bind:value={newCategoryName}
        placeholder="카테고리 이름..."
        on:keydown={e => e.key === 'Enter' && addCategory()}
        autofocus
      />
      <button on:click={addCategory}>추가</button>
      <button class="cancel" on:click={() => { isAddingCategory = false; newCategoryName = ''; }}>✕</button>
    </div>
  {/if}

  <!-- 카테고리 목록 -->
  {#if view === 'categories'}
    {#if $playlists.length === 0}
      <div class="empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <p>+ 버튼으로 카테고리 추가</p>
      </div>
    {:else}
      {#each $playlists as cat (cat.id)}
        <div class="cat-item" on:click={() => openCategory(cat)}>
          {#if renamingId === cat.id}
            <input
              class="rename-input"
              bind:value={renameValue}
              on:click|stopPropagation
              on:keydown={e => {
                if (e.key === 'Enter') { playlists.renameCategory(cat.id, renameValue); renamingId = null; }
                if (e.key === 'Escape') renamingId = null;
              }}
              autofocus
            />
          {:else}
            <div class="cat-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <div class="cat-info">
              <span class="cat-name">{cat.name}</span>
              <span class="cat-count">{cat.tracks.length}곡</span>
            </div>
            <div class="cat-actions" on:click|stopPropagation>
              <button title="이름변경" on:click={() => { renamingId = cat.id; renameValue = cat.name; }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="del" title="삭제" on:click={() => playlists.removeCategory(cat.id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
            </div>
            <svg class="arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          {/if}
        </div>
      {/each}
    {/if}
  {/if}

  <!-- 트랙 목록 -->
  {#if view === 'tracks' && selectedCategory}
    {#if selectedCategory.tracks.length === 0}
      <div class="empty">
        <p>검색 결과에서 ♥ 눌러 추가하세요</p>
      </div>
    {:else}
      <div class="play-all-row">
        <button class="play-all-btn" on:click={() => playAll(selectedCategory)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          전체 재생
        </button>
      </div>
      {#each selectedCategory.tracks as track, i (track.videoId)}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="track-item"
          class:drag-over={dragOverIndex === i}
          class:dragging={dragIndex === i}
          draggable="true"
          on:click={() => playTrack(track)}
          on:dragstart={e => onDragStart(e, i)}
          on:dragover={e => onDragOver(e, i)}
          on:dragleave={() => dragOverIndex = null}
          on:dragend={onDragEnd}
          on:drop={e => onDrop(e, i)}
        >
          <!-- 드래그 핸들 -->
          <div class="drag-handle" on:click|stopPropagation>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
              <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </div>
          <div class="thumb">
            <img src={track.thumbnail} alt="" loading="lazy" />
            <div class="play-over">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          <div class="track-info">
            <div class="t-title">{track.title}</div>
            <div class="t-meta">{track.channel}{track.duration ? ' · ' + track.duration : ''}</div>
          </div>
          <button class="del-track" on:click|stopPropagation={() => playlists.removeTrack(selectedCategory.id, track.videoId)}>✕</button>
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .panel {
    background: #0d1117;
    border: 1px solid #21262d;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid #21262d;
    background: #0d1117;
    position: sticky;
    top: 0;
    z-index: 1;
    flex-shrink: 0;
  }
  .header-title {
    font-family: 'DM Mono', monospace;
    font-size: 18px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #4d5566;
    flex: 1;
  }
  .count { color: #4fc3f7; font-family: 'DM Mono', monospace; font-size: 18px; }

  .back-btn {
    background: none; border: none; color: #4d5566; cursor: pointer; padding: 2px;
    display: flex; align-items: center;
    transition: color 0.15s;
  }
  .back-btn:hover { color: #4fc3f7; }

  .add-cat-btn {
    background: none; border: 1px solid #30363d; color: #4d5566;
    width: 20px; height: 20px; cursor: pointer; font-size: 18px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; line-height: 1;
  }
  .add-cat-btn:hover { border-color: #4fc3f7; color: #4fc3f7; }

  /* Add input */
  .add-input-row {
    display: flex; gap: 4px; padding: 8px 16px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }
  .add-input-row input {
    flex: 1; background: #161b22; border: 1px solid #30363d;
    color: #f0f0f0; padding: 6px 10px;
    font-family: 'DM Sans', sans-serif; font-size: 18px; outline: none;
  }
  .add-input-row input:focus { border-color: #4fc3f7; }
  .add-input-row button {
    background: #4fc3f7; border: none; color: #fff; cursor: pointer;
    padding: 0 10px; font-family: 'DM Mono', monospace; font-size: 18px;
    letter-spacing: 1px; transition: background 0.15s;
  }
  .add-input-row button:hover { background: #0288d1; }
  .add-input-row button.cancel { background: none; border: 1px solid #30363d; color: #4d5566; }
  .add-input-row button.cancel:hover { border-color: #ff4757; color: #ff4757; }

  /* Category items */
  .cat-item {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; cursor: pointer;
    border-bottom: 1px solid #161b22;
    transition: background 0.15s;
  }
  .cat-item:hover { background: #161b22; }
  .cat-icon { color: #4d5566; flex-shrink: 0; }
  .cat-info { flex: 1; min-width: 0; }
  .cat-name { display: block; font-size: 18px; margin-bottom: 2px; }
  .cat-count { font-family: 'DM Mono', monospace; font-size: 18px; color: #4d5566; }

  .cat-actions {
    display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s;
  }
  .cat-item:hover .cat-actions { opacity: 1; }
  .cat-actions button {
    background: none; border: none; color: #4d5566; cursor: pointer;
    padding: 4px; display: flex; align-items: center; transition: color 0.15s;
  }
  .cat-actions button:hover { color: #4fc3f7; }
  .cat-actions button.del:hover { color: #ff4757; }
  .arrow { color: #30363d; flex-shrink: 0; }

  .rename-input {
    flex: 1; background: #161b22; border: 1px solid #4fc3f7;
    color: #f0f0f0; padding: 4px 8px;
    font-family: 'DM Sans', sans-serif; font-size: 18px; outline: none;
  }

  /* Play all */
  .play-all-row {
    padding: 8px 16px; border-bottom: 1px solid #21262d; flex-shrink: 0;
  }
  .play-all-btn {
    display: flex; align-items: center; gap: 6px;
    background: #4fc3f7; border: none; color: #fff; cursor: pointer;
    padding: 6px 14px; font-family: 'DM Mono', monospace;
    font-size: 18px; letter-spacing: 1px; transition: background 0.15s;
  }
  .play-all-btn:hover { background: #0288d1; }

  /* Track items */
  .track-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px; cursor: pointer;
    border-bottom: 1px solid #161b22;
    transition: background 0.15s;
  }
  .track-item:hover { background: #161b22; }

  .thumb {
    width: 56px; height: 32px; flex-shrink: 0;
    background: #1c2128; position: relative; overflow: hidden;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .play-over {
    position: absolute; inset: 0; background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.2s;
  }
  .track-item:hover .play-over { opacity: 1; }

  .track-info { flex: 1; min-width: 0; }
  .t-title {
    font-size: 18px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;
  }
  .t-meta {
    font-family: 'DM Mono', monospace; font-size: 18px; color: #4d5566;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .drag-handle {
    cursor: grab;
    padding: 4px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .track-item:hover .drag-handle { opacity: 1; }
  .drag-handle:active { cursor: grabbing; }

  .track-item.dragging {
    opacity: 0.4;
  }
  .track-item.drag-over {
    border-top: 2px solid #4fc3f7;
  }

  .del-track {
    background: none; border: none; color: #30363d; cursor: pointer;
    font-size: 18px; padding: 4px; transition: color 0.15s; flex-shrink: 0;
  }
  .del-track:hover { color: #ff4757; }

  /* Empty */
  .empty {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 40px 16px; gap: 10px; flex: 1;
  }
  .empty p {
    font-family: 'DM Mono', monospace; font-size: 18px;
    color: #4d5566; letter-spacing: 1px; text-align: center;
  }

  /* Scrollable content */
  .panel > :not(.panel-header):not(.add-input-row):not(.play-all-row) {
    overflow-y: auto;
  }
  .panel > :not(.panel-header):not(.add-input-row):not(.play-all-row)::-webkit-scrollbar { width: 3px; }
  .panel > :not(.panel-header):not(.add-input-row):not(.play-all-row)::-webkit-scrollbar-thumb { background: #242424; }
</style>