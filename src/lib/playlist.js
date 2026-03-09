// src/lib/playlist.js
// 카테고리(플레이리스트) 관리 store

import { writable } from 'svelte/store';

function loadPlaylists() {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('muze_playlists') ?? '[]');
  } catch { return []; }
}

function createPlaylistStore() {
  const { subscribe, set, update } = writable(loadPlaylists());

  function save(playlists) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('muze_playlists', JSON.stringify(playlists));
    }
  }

  return {
    subscribe,

    // 카테고리 추가
    addCategory(name) {
      update(pls => {
        if (pls.find(p => p.name === name)) return pls;
        const next = [...pls, { id: Date.now(), name, tracks: [] }];
        save(next);
        return next;
      });
    },

    // 카테고리 삭제
    removeCategory(id) {
      update(pls => {
        const next = pls.filter(p => p.id !== id);
        save(next);
        return next;
      });
    },

    // 카테고리 이름 변경
    renameCategory(id, name) {
      update(pls => {
        const next = pls.map(p => p.id === id ? { ...p, name } : p);
        save(next);
        return next;
      });
    },

    // 트랙 추가
    addTrack(categoryId, track) {
      update(pls => {
        const next = pls.map(p => {
          if (p.id !== categoryId) return p;
          if (p.tracks.find(t => t.videoId === track.videoId)) return p;
          return { ...p, tracks: [...p.tracks, track] };
        });
        save(next);
        return next;
      });
    },

    // 트랙 순서 변경
    reorderTracks(categoryId, fromIndex, toIndex) {
      update(pls => {
        const next = pls.map(p => {
          if (p.id !== categoryId) return p;
          const tracks = [...p.tracks];
          const [moved] = tracks.splice(fromIndex, 1);
          tracks.splice(toIndex, 0, moved);
          return { ...p, tracks };
        });
        save(next);
        return next;
      });
    },

    // 트랙 삭제
    removeTrack(categoryId, videoId) {
      update(pls => {
        const next = pls.map(p => {
          if (p.id !== categoryId) return p;
          return { ...p, tracks: p.tracks.filter(t => t.videoId !== videoId) };
        });
        save(next);
        return next;
      });
    }
  };
}

export const playlists = createPlaylistStore();