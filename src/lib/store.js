// src/lib/store.js
import { writable, derived } from 'svelte/store';

// localStorage에서 불러오기
function loadFromStorage(key, fallback) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

// localStorage에 자동 저장되는 store
function persistent(key, fallback) {
  const store = writable(loadFromStorage(key, fallback));
  store.subscribe(val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(val));
    }
  });
  return store;
}

// 재생 큐는 세션용 (새로고침하면 초기화)
export const queue        = writable([]);
export const currentIndex = writable(-1);

// 설정은 영구 저장
export const isShuffle    = persistent('muze_shuffle', false);
export const isRepeat     = persistent('muze_repeat', 0); // 0=off 1=all 2=one
export const volume       = persistent('muze_volume', 80);

// 재생 상태는 세션용 (저장 불필요)
export const isPlaying    = writable(false);
export const currentTime  = writable(0);
export const duration     = writable(0);
export const playerReady  = writable(false);
export const status       = writable({ text: '대기 중', active: false });

export const currentTrack = derived(
  [queue, currentIndex],
  ([$queue, $currentIndex]) => $queue[$currentIndex] ?? null
);

export const progress = derived(
  [currentTime, duration],
  ([$currentTime, $duration]) => ($duration > 0 ? ($currentTime / $duration) * 100 : 0)
);

export function setStatus(text, active = false) {
  status.set({ text, active });
}